import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { gotyColors, gotyShared } from './goty-theme';

type IconName = keyof typeof Ionicons.glyphMap;

// ---------- Feedback (toast dourado da experiência) ----------

type FeedbackTone = 'success' | 'error' | 'info';
type FeedbackMessage = { id: number; text: string; tone: FeedbackTone };

const GotyFeedbackContext = createContext<(text: string, tone?: FeedbackTone) => void>(() => undefined);

export function useGotyNotify() {
  return useContext(GotyFeedbackContext);
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function GotyFeedbackProvider({ children, bottomOffset = 0 }: { children: ReactNode; bottomOffset?: number }) {
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const counter = useRef(0);

  const notify = useCallback((text: string, tone: FeedbackTone = 'success') => {
    counter.current += 1;
    setMessage({ id: counter.current, text, tone });
  }, []);

  useEffect(() => {
    if (!message) return undefined;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMessage(current => (current?.id === message.id ? null : current));
      });
    }, message.tone === 'error' ? 4200 : 2600);
    return () => clearTimeout(timer);
  }, [message, opacity]);

  const icon: IconName = message?.tone === 'error' ? 'alert-circle' : message?.tone === 'info' ? 'information-circle' : 'checkmark-circle';

  return (
    <GotyFeedbackContext.Provider value={notify}>
      {children}
      {message ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.toast, { bottom: bottomOffset + 16, opacity }, message.tone === 'error' && styles.toastError]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          <Ionicons
            name={icon}
            size={18}
            color={message.tone === 'error' ? gotyColors.red : gotyColors.goldBright}
          />
          <Text style={styles.toastText}>{message.text}</Text>
        </Animated.View>
      ) : null}
    </GotyFeedbackContext.Provider>
  );
}

// ---------- Sheet temático ----------

export function GotySheet({
  visible,
  title,
  description,
  onClose,
  children,
  footer,
  avoidKeyboard = false,
  fullHeight = false,
}: {
  visible: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  avoidKeyboard?: boolean;
  fullHeight?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.flex}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          enabled={avoidKeyboard}
          style={styles.flex}
        >
          <View style={styles.backdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar" accessibilityRole="button" />
            <View
              style={[
                styles.sheet,
                fullHeight && styles.sheetFull,
                { paddingBottom: footer ? 0 : Math.max(16, insets.bottom + 8) },
              ]}
            >
              <View style={styles.grabber} />
              <View style={styles.sheetHeader}>
                <View style={styles.flexShrink}>
                  <Text style={styles.sheetTitle} accessibilityRole="header">{title}</Text>
                  {description ? <Text style={styles.sheetDescription}>{description}</Text> : null}
                </View>
                <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={12} style={styles.closeButton}>
                  <Ionicons name="close" size={20} color={gotyColors.textMuted} />
                </Pressable>
              </View>
              <View style={fullHeight ? styles.flex : styles.flexShrink}>{children}</View>
              {footer ? (
                <View style={[styles.sheetFooter, { paddingBottom: Math.max(14, insets.bottom + 6) }]}>{footer}</View>
              ) : null}
            </View>
          </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ---------- Controle segmentado dourado ----------

export function GotySegmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  accessibilityLabel,
}: {
  options: ReadonlyArray<{ value: T; label: string; icon: IconName; badge?: string | number | null }>;
  value: T;
  onChange: (value: T) => void;
  size?: 'md' | 'lg';
  accessibilityLabel?: string;
}) {
  return (
    <View style={[styles.segmented, size === 'lg' && styles.segmentedLarge]} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.segment,
              size === 'lg' && styles.segmentLarge,
              active && styles.segmentActive,
              pressed && !active && styles.segmentPressed,
            ]}
          >
            <Ionicons name={option.icon} size={size === 'lg' ? 15 : 13} color={active ? gotyColors.onGold : gotyColors.textMuted} />
            <Text
              style={[styles.segmentText, size === 'lg' && styles.segmentTextLarge, active && styles.segmentTextActive]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
            {option.badge != null ? (
              <View style={[styles.segmentBadge, active && styles.segmentBadgeActive]}>
                <Text style={[styles.segmentBadgeText, active && styles.segmentTextActive]}>{option.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Chips e pílulas ----------

export function GotyChip({
  label,
  count,
  active,
  icon,
  onPress,
}: {
  label: string;
  count?: number;
  active: boolean;
  icon?: IconName;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.chipPressed]}
    >
      {icon ? <Ionicons name={icon} size={12} color={active ? gotyColors.goldPale : gotyColors.textSubtle} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {count != null ? <Text style={[styles.chipCount, active && styles.chipTextActive]}>{count}</Text> : null}
    </Pressable>
  );
}

type PillTone = 'gold' | 'solidGold' | 'emerald' | 'red' | 'muted' | 'amber';

export function GotyPill({ label, icon, tone = 'gold', style }: { label: string; icon?: IconName; tone?: PillTone; style?: StyleProp<ViewStyle> }) {
  const palette = PILL_TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg, borderColor: palette.border }, style]}>
      {icon ? <Ionicons name={icon} size={11} color={palette.fg} /> : null}
      <Text style={[styles.pillText, { color: palette.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const PILL_TONES: Record<PillTone, { bg: string; border: string; fg: string }> = {
  gold: { bg: gotyColors.goldTint, border: gotyColors.goldBorder, fg: gotyColors.goldPale },
  solidGold: { bg: gotyColors.goldStrong, border: gotyColors.goldStrong, fg: gotyColors.onGold },
  emerald: { bg: gotyColors.emeraldTint, border: gotyColors.emeraldBorder, fg: gotyColors.emeraldText },
  red: { bg: gotyColors.redTint, border: gotyColors.redBorder, fg: gotyColors.redText },
  muted: { bg: gotyColors.white04, border: gotyColors.hairline, fg: gotyColors.textSubtle },
  amber: { bg: gotyColors.amberTint, border: gotyColors.amberBorder, fg: gotyColors.amberText },
};

export function GotyButton({
  label,
  icon,
  onPress,
  variant = 'gold',
  disabled,
  loading,
  style,
  accessibilityLabel,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  variant?: 'gold' | 'ghost' | 'quiet' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const textStyle = variant === 'gold'
    ? gotyShared.goldButtonText
    : variant === 'danger'
      ? styles.dangerText
      : variant === 'quiet'
        ? styles.quietText
        : gotyShared.ghostButtonText;
  const iconColor = variant === 'gold' ? gotyColors.onGold : variant === 'danger' ? gotyColors.redText : variant === 'quiet' ? gotyColors.textMuted : gotyColors.goldText;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      style={({ pressed }) => [
        variant === 'gold' ? gotyShared.goldButton : gotyShared.ghostButton,
        variant === 'quiet' && styles.quietButton,
        variant === 'danger' && styles.dangerButton,
        (disabled || loading) && gotyShared.disabled,
        pressed && gotyShared.pressed,
        style,
      ]}
    >
      {icon ? <Ionicons name={loading ? 'hourglass-outline' : icon} size={15} color={iconColor} /> : null}
      <Text style={textStyle} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function GotyStat({ label, value, tone = 'text' }: { label: string; value: string | number; tone?: 'gold' | 'text' | 'muted' }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone === 'gold' && { color: '#f7de93' }, tone === 'muted' && { color: '#d6cab0' }]}>{value}</Text>
    </View>
  );
}

export function GotyEmpty({ title, actionLabel, onAction, icon = 'sparkles' }: { title: string; actionLabel?: string; onAction?: () => void; icon?: IconName }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={26} color="#c9a854" />
      <Text style={styles.emptyTitle}>{title}</Text>
      {actionLabel && onAction ? <GotyButton label={actionLabel} onPress={onAction} variant="ghost" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(227,193,104,0.45)',
    backgroundColor: 'rgba(12,11,16,0.97)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  toastError: { borderColor: gotyColors.redBorder },
  toastText: { flex: 1, color: gotyColors.text, fontSize: 13, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    backgroundColor: '#0b0a0f',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: gotyColors.goldBorder,
    overflow: 'hidden',
  },
  sheetFull: { height: '90%' },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(223,192,108,0.35)', marginTop: 8 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: gotyColors.goldBorderSoft,
  },
  sheetTitle: { color: gotyColors.textStrong, fontSize: 17, fontWeight: '900', letterSpacing: -0.2 },
  sheetDescription: { color: gotyColors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 3, lineHeight: 17 },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: gotyColors.white04,
  },
  sheetFooter: {
    borderTopWidth: 1,
    borderTopColor: gotyColors.goldBorderSoft,
    backgroundColor: '#0f0e14',
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  segmented: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.2)',
    backgroundColor: gotyColors.surface,
  },
  segmentedLarge: { padding: 5, borderColor: 'rgba(223,192,108,0.25)' },
  segment: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 6,
  },
  segmentLarge: { minHeight: 44 },
  segmentActive: {
    backgroundColor: gotyColors.goldStrong,
    shadowColor: '#dcb24a',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  segmentPressed: { backgroundColor: gotyColors.white04 },
  segmentText: { color: gotyColors.textMuted, fontSize: 12, fontWeight: '800', flexShrink: 1 },
  segmentTextLarge: { fontSize: 13, fontWeight: '900' },
  segmentTextActive: { color: gotyColors.onGold },
  segmentBadge: { borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 6, paddingVertical: 1 },
  segmentBadgeActive: { backgroundColor: 'rgba(0,0,0,0.14)' },
  segmentBadgeText: { color: gotyColors.textMuted, fontSize: 10, fontWeight: '800' },
  chip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: gotyColors.hairline,
    backgroundColor: '#121118',
    paddingHorizontal: 12,
  },
  chipActive: { borderColor: gotyColors.goldBorderStrong, backgroundColor: 'rgba(223,192,108,0.18)' },
  chipPressed: { opacity: 0.8 },
  chipText: { color: '#a79c82', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#fbf0cc' },
  chipCount: { color: '#a79c82', fontSize: 10, fontWeight: '700', opacity: 0.8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '100%',
  },
  pillText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase', flexShrink: 1 },
  quietButton: { borderColor: gotyColors.hairline, backgroundColor: gotyColors.white04 },
  quietText: { color: '#c7b999', fontSize: 13, fontWeight: '700' },
  dangerButton: { borderColor: gotyColors.redBorder, backgroundColor: gotyColors.redTint },
  dangerText: { color: gotyColors.redText, fontSize: 13, fontWeight: '800' },
  stat: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.2)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  statLabel: { color: '#a99b7c', fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  statValue: { color: gotyColors.textStrong, fontSize: 18, fontWeight: '900', marginTop: 3 },
  empty: {
    alignItems: 'center',
    gap: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(223,192,108,0.2)',
    backgroundColor: '#0f0e14',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  emptyTitle: { color: '#f7efd7', fontSize: 14, fontWeight: '800', textAlign: 'center' },
});
