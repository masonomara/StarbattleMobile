import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import RNBootSplash

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)
    window?.backgroundColor = .black

    factory.startReactNative(
      withModuleName: "StarbattleMobile",
      in: window,
      launchOptions: launchOptions
    )

    // The host view created by startReactNative defaults to white; make it black
    // so the launch → first-React-paint gap matches the (black) splash.
    window?.rootViewController?.view.backgroundColor = .black

    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  // @objc is REQUIRED: the superclass satisfies this protocol method with a
  // default impl in its .mm, invisible to Swift, so without @objc this method is
  // never registered with the ObjC runtime and RN's `[delegate customizeRootView:]`
  // call never reaches it — leaving RNBootSplash uninitialized (white-flash bug).
  @objc
  func customizeRootView(_ rootView: RCTRootView) {
    // Hold the native splash across the launch → JS handoff, and match its
    // background so the gap is never white.
    rootView.backgroundColor = .black
    RNBootSplash.initWithStoryboard("BootSplash", rootView: rootView)
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
