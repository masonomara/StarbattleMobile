import { useCallback, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

// Tracks whether a scroll view has moved off the top, so a header can show its
// bottom hairline the moment content scrolls under it and hide it again at rest
// — the standard iOS nav-bar separator behaviour.
//
// `onScroll` can be wired straight to a ScrollView/FlatList, or passed as the
// `listener` of an Animated.event when the view already drives a native scroll
// value (it still receives the raw native event).
export function useScrollBorder() {
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = e.nativeEvent.contentOffset.y > 0;
      // Only re-render when crossing the top edge, not on every scroll frame.
      setScrolled(prev => (prev === next ? prev : next));
    },
    [],
  );
  return { scrolled, onScroll };
}
