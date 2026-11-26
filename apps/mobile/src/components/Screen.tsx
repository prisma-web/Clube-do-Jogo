import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type LayoutChangeEvent, type ScrollViewProps } from 'react-native';
import { useAnimatedRef, useScrollOffset, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, themedStyles, useNativeTheme } from '@/theme';
import { useGotyBadgeClearance } from '@/features/goty/GotyFloatingBadge';

const SCROLL_BOTTOM_PADDING = spacing.xxxl * 2;
const KEYBOARD_GAP = spacing.md;

type FormTarget = RefObject<View | null>;

const KeyboardFormContext = createContext<(form: FormTarget | null) => void>(() => {});

export type ScreenScroll = {
  offset: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  scrollTo: (y: number) => void;
  setFocusScrollPaused: (paused: boolean) => void;
};

const ScreenScrollContext = createContext<ScreenScroll | null>(null);

export function useScreenScroll(): ScreenScroll | null {
  return useContext(ScreenScrollContext);
}

export function useKeepFormAboveKeyboard(form: FormTarget) {
  const setFocusedForm = useContext(KeyboardFormContext);
  return { onFocus: () => setFocusedForm(form), onBlur: () => setFocusedForm(null) };
}

export function Screen({ children, scroll = true, contentContainerStyle, onRefresh, refreshing, edges }: {
  children: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  onRefresh?: () => void;
  refreshing?: boolean;
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
}) {
  const theme = useNativeTheme();
  const styles = useStyles();
  const badgeClearance = useGotyBadgeClearance();
  const safeArea = [styles.safeArea, theme.scene !== 'none' && styles.safeAreaScenic];
  const { scrollRef, contentRef, setFocusedForm, onScrollLayout } = useFormAboveKeyboard();
  const { attachScroll, screenScroll, onViewportLayout, focusScrollPaused } = useScreenScrollState(scrollRef);
  const shapeKey = `${theme.shape.font}-${theme.shape.decor ? 'decor' : 'plain'}`;

  if (!scroll) {
    return (
      <SafeAreaView key={shapeKey} style={safeArea} edges={edges ?? ['top']}>
        <View style={[styles.content, contentContainerStyle as object]}>{children}</View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView key={shapeKey} style={safeArea} edges={edges ?? ['top']}>
      <KeyboardAvoidingView style={styles.keyboardArea} behavior="height" enabled={Platform.OS === 'android'}>
        <ScrollView
          ref={attachScroll}
          innerViewRef={contentRef}
          onLayout={event => {
            onViewportLayout(event);
            void onScrollLayout();
          }}
          scrollEventThrottle={16}
          scrollsChildToFocus={!focusScrollPaused}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(SCROLL_BOTTOM_PADDING, badgeClearance) }, contentContainerStyle as object]}
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={theme.colors.violet400} /> : undefined}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
        >
          <ScreenScrollContext.Provider value={screenScroll}>
            <KeyboardFormContext.Provider value={setFocusedForm}>{children}</KeyboardFormContext.Provider>
          </ScreenScrollContext.Provider>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useScreenScrollState(scrollRef: RefObject<ScrollView | null>) {
  const animatedRef = useAnimatedRef<ScrollView>();
  const offset = useScrollOffset(animatedRef);
  const viewportHeight = useSharedValue(0);
  const [focusScrollPaused, setFocusScrollPaused] = useState(false);
  const attachScroll = useCallback((node: ScrollView | null) => {
    scrollRef.current = node;
    animatedRef(node);
  }, [animatedRef, scrollRef]);
  const screenScroll = useMemo<ScreenScroll>(() => ({
    offset,
    viewportHeight,
    scrollTo: y => scrollRef.current?.scrollTo({ y, animated: true }),
    setFocusScrollPaused,
  }), [offset, scrollRef, viewportHeight]);
  const onViewportLayout = useCallback((event: LayoutChangeEvent) => {
    viewportHeight.set(event.nativeEvent.layout.height);
  }, [viewportHeight]);
  return { attachScroll, screenScroll, onViewportLayout, focusScrollPaused };
}

type Box = { y: number; height: number };

function measureInWindow(view: Pick<View, 'measureInWindow'>): Promise<Box> {
  return new Promise(resolve => view.measureInWindow((_x, y, _width, height) => resolve({ y, height })));
}

function useFormAboveKeyboard() {
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null) as RefObject<View>;
  const focusedForm = useRef<FormTarget | null>(null);
  const keyboardTop = useRef<number | null>(null);

  const reveal = useCallback(async () => {
    const scroll = scrollRef.current;
    const viewport = scroll?.getNativeScrollRef();
    const content = contentRef.current;
    const form = focusedForm.current?.current;
    const top = keyboardTop.current;
    if (!scroll || !viewport || !content || !form || top === null) return;
    const [formBox, scrollBox, contentBox] = await Promise.all([measureInWindow(form), measureInWindow(viewport), measureInWindow(content)]);
    const visibleBottom = Math.min(top, scrollBox.y + scrollBox.height);
    const overlap = formBox.y + formBox.height + KEYBOARD_GAP - visibleBottom;
    if (overlap <= 0) return;
    scroll.scrollTo({ y: scrollBox.y - contentBox.y + overlap, animated: true });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const shown = Keyboard.addListener(showEvent, event => {
      keyboardTop.current = event.endCoordinates.screenY;
      void reveal();
    });
    const hidden = Keyboard.addListener(hideEvent, () => {
      keyboardTop.current = null;
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [reveal]);

  const setFocusedForm = useCallback((form: FormTarget | null) => {
    focusedForm.current = form;
    void reveal();
  }, [reveal]);

  return { scrollRef, contentRef, setFocusedForm, onScrollLayout: reveal };
}

const useStyles = themedStyles(colors => ({
  keyboardArea: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  safeAreaScenic: { backgroundColor: 'transparent' },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, flexGrow: 1 },
}));
