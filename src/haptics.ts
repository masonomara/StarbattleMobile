import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

export const hapticLight = () =>
  ReactNativeHapticFeedback.trigger('impactLight');
export const hapticMedium = () =>
  ReactNativeHapticFeedback.trigger('impactMedium');
export const hapticSuccess = () =>
  ReactNativeHapticFeedback.trigger('notificationSuccess');
