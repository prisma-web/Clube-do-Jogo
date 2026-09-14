import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Profile } from '@clube-do-jogo/domain';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';

// Same boundary rule as the web editor's `type="url"` avatar field (src/components/profile-view.tsx):
// an empty value clears the avatar, anything else must parse as an absolute URL.
export function parseAvatarUrlInput(raw: string): { value: string | null; error: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, error: null };
  try {
    new URL(trimmed);
    return { value: trimmed, error: null };
  } catch {
    return { value: null, error: 'Informe uma URL válida para o avatar (ex.: https://exemplo.com/avatar.png).' };
  }
}

export function ProfileEditSheet({ visible, profile, saving, error, onClose, onSave }: {
  visible: boolean;
  profile: Profile;
  saving: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (input: { name: string; bio: string; avatarUrl: string | null }) => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const [name, setName] = useState(profile.name || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '');
  const [avatarError, setAvatarError] = useState<string | null>(null);

  function handleSave() {
    const parsed = parseAvatarUrlInput(avatarUrl);
    if (parsed.error) {
      setAvatarError(parsed.error);
      return;
    }
    setAvatarError(null);
    onSave({ name, bio, avatarUrl: parsed.value });
  }

  return (
    <Sheet visible={visible} title="Editar perfil" onClose={onClose} avoidKeyboard>
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarRow}>
          <Avatar uri={avatarUrl || null} crop={profile.avatar_crop} name={name || profile.name} size={56} />
          <Text style={styles.avatarHint}>Escolha um avatar pela galeria, por um personagem de um jogo ou por uma URL de imagem.</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Nome</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Seu nome"
            placeholderTextColor={colors.zinc600}
            style={styles.input}
            selectTextOnFocus
            testID="profile-name"
            accessibilityLabel="Nome"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Sobre você</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="Fale um pouco sobre você"
            placeholderTextColor={colors.zinc600}
            multiline
            numberOfLines={3}
            style={[styles.input, styles.textarea]}
            selectTextOnFocus
            testID="profile-bio"
            accessibilityLabel="Sobre você"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>URL do avatar</Text>
          <View style={styles.urlRow}>
            <TextInput
              value={avatarUrl}
              onChangeText={value => { setAvatarUrl(value); if (avatarError) setAvatarError(null); }}
              placeholder="https://…"
              placeholderTextColor={colors.zinc600}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.input, styles.urlInput]}
              selectTextOnFocus
              testID="profile-avatar-url"
              accessibilityLabel="URL do avatar"
            />
            {avatarUrl ? (
              <Pressable
                onPress={() => { setAvatarUrl(''); setAvatarError(null); }}
                accessibilityRole="button"
                accessibilityLabel="Limpar URL do avatar"
                hitSlop={8}
                style={styles.urlClear}
              >
                <Ionicons name="close" size={16} color={colors.zinc500} />
              </Pressable>
            ) : null}
          </View>
          {avatarError ? <Text style={styles.error} testID="profile-avatar-url-error">{avatarError}</Text> : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={saving ? 'Salvando…' : 'Salvar alterações'}
          loading={saving}
          onPress={handleSave}
        />
      </ScrollView>
    </Sheet>
  );
}

const useStyles = themedStyles(colors => ({
  content: { padding: spacing.lg, gap: spacing.lg },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatarHint: { flex: 1, ...typography.small, color: colors.zinc500 },
  field: { gap: spacing.xs },
  label: { ...typography.tiny, color: colors.zinc500 },
  input: {
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 14,
  },
  textarea: { minHeight: 84, textAlignVertical: 'top', paddingTop: spacing.sm },
  urlRow: { position: 'relative', justifyContent: 'center' },
  urlInput: { paddingRight: 44 },
  urlClear: {
    position: 'absolute',
    right: spacing.xs,
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.red300, fontSize: 11, fontWeight: '600' },
}));
