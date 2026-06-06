#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

// In-app-target native module for switching the iOS app icon.
//
// We deliberately do NOT use a third-party library: react-native-change-icon
// ships a codegen TurboModule spec that is not registered into this app's New
// Architecture module-provider map (RCTModuleProviders.mm), so NativeModules.X
// resolves to null on RN 0.84 bridgeless. A plain legacy RCT_EXPORT_MODULE class
// compiled into the app target is auto-discovered through the bridgeless legacy
// module interop, which sidesteps that problem entirely.
@interface AppIconModule : NSObject <RCTBridgeModule>
@end

@implementation AppIconModule

// Registers this class with RN's module system under the name "AppIconModule".
RCT_EXPORT_MODULE();

// UIApplication APIs must run on the main thread; we hop there explicitly in each
// method, so we don't need the setup itself on the main queue.
+ (BOOL)requiresMainQueueSetup {
  return NO;
}

// Resolves with the current alternate icon name, or "Default" for the primary icon.
RCT_EXPORT_METHOD(getIcon:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    NSString *current = [[UIApplication sharedApplication] alternateIconName];
    resolve(current ?: @"Default");
  });
}

// Whether the device/app supports alternate icons at all.
RCT_EXPORT_METHOD(supportsAlternateIcons:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    resolve(@([[UIApplication sharedApplication] supportsAlternateIcons]));
  });
}

// Sets the alternate icon. Pass nil/""/"Default" to reset to the primary icon.
RCT_EXPORT_METHOD(setIcon:(NSString *)iconName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    UIApplication *app = [UIApplication sharedApplication];

    if (![app supportsAlternateIcons]) {
      reject(@"NOT_SUPPORTED", @"Alternate icons are not supported", nil);
      return;
    }

    NSString *current = [app alternateIconName];
    NSString *target = (iconName.length == 0 || [iconName isEqualToString:@"Default"])
                         ? nil
                         : iconName;

    // No-op when already on the requested icon — avoids the redundant iOS system
    // alert and the "icon already used" failure path.
    BOOL alreadySet = (target == nil && current == nil) || [target isEqualToString:current];
    if (alreadySet) {
      resolve(target ?: @"Default");
      return;
    }

    // The icon-change alert subsystem can transiently fail with POSIX EAGAIN (35)
    // — "Resource temporarily unavailable" from LSIconAlertManager — when called
    // close to launch or in quick succession. Retry a few times before giving up.
    [self setAlternateIcon:target app:app attemptsLeft:5 resolve:resolve reject:reject];
  });
}

// Sets the alternate icon with bounded retry on transient EAGAIN (POSIX 35).
// Must be invoked on the main queue.
- (void)setAlternateIcon:(NSString *)target
                     app:(UIApplication *)app
            attemptsLeft:(NSInteger)attemptsLeft
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject {
  [app setAlternateIconName:target completionHandler:^(NSError *_Nullable error) {
    BOOL transient = error != nil &&
                     [error.domain isEqualToString:NSPOSIXErrorDomain] &&
                     error.code == EAGAIN;

    if (error == nil) {
      resolve(target ?: @"Default");
    } else if (transient && attemptsLeft > 1) {
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.4 * NSEC_PER_SEC)),
                     dispatch_get_main_queue(), ^{
        [self setAlternateIcon:target app:app attemptsLeft:attemptsLeft - 1 resolve:resolve reject:reject];
      });
    } else {
      reject(@"SET_FAILED", error.localizedDescription, error);
    }
  }];
}

@end
