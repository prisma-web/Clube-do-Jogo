import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { AdminUser, AppRole } from '@clube-do-jogo/domain';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { useAdminUsers, useSetAdminUserRole } from '@/state/admin-queries';
import { useApp } from '@/state/app-provider';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';

export function AdminAccessPanel() {
  const colors = useThemeColors();
  const styles = useStyles();
  const { userId } = useApp();
  const usersQuery = useAdminUsers();
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<AdminUser | null>(null);

  if (usersQuery.isLoading) return <LoadingState label="Carregando usuários…" />;
  if (usersQuery.isError) {
    return <ErrorState message={usersQuery.error.message} onRetry={() => void usersQuery.refetch()} />;
  }

  const users = usersQuery.data || [];
  const adminCount = users.filter(user => user.role === 'admin').length;
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const visibleUsers = normalizedSearch
    ? users.filter(user => `${user.name || ''} ${user.email || ''}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch))
    : users;

  return (
    <View style={styles.container}>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar por nome ou email"
        placeholderTextColor={colors.zinc600}
        style={styles.search}
        accessibilityLabel="Buscar usuário"
        testID="admin-user-search"
      />

      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>{users.length} usuários</Text>
        <Text style={styles.summaryText}>{adminCount} administradores</Text>
      </View>

      {visibleUsers.length === 0 ? (
        <EmptyState icon="people-outline" title="Nenhum usuário encontrado" />
      ) : (
        <View style={styles.list}>
          {visibleUsers.map(user => (
            <UserRow
              key={user.id}
              user={user}
              isSelf={user.id === userId}
              lastAdmin={user.role === 'admin' && adminCount === 1}
              onPress={() => setTarget(user)}
            />
          ))}
        </View>
      )}

      <RoleChangeSheet
        key={target?.id || 'closed'}
        target={target}
        lastAdmin={Boolean(target && target.role === 'admin' && adminCount === 1)}
        onClose={() => setTarget(null)}
      />
    </View>
  );
}

function UserRow({ user, isSelf, lastAdmin, onPress }: {
  user: AdminUser;
  isSelf: boolean;
  lastAdmin: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const promote = user.role !== 'admin';
  const label = lastAdmin
    ? `${user.name || 'Membro'} é o último administrador`
    : promote
      ? `Tornar ${user.name || 'membro'} administrador`
      : `Remover cargo de administrador de ${user.name || 'membro'}`;
  return (
    <View style={styles.userCard} testID={`admin-user-${user.id}`}>
      <Avatar uri={user.avatar_url} crop={user.avatar_crop} name={user.name} size={44} />
      <View style={styles.userInfo}>
        <View style={styles.userNameRow}>
          <Text style={styles.userName} numberOfLines={1}>{user.name || 'Membro'}</Text>
          {isSelf ? <Text style={styles.selfBadge}>Você</Text> : null}
        </View>
        <Text style={styles.userEmail} numberOfLines={1}>{user.email || 'Sem email público'}</Text>
      </View>
      <Pressable
        disabled={lastAdmin}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: lastAdmin }}
        testID={`admin-user-role-${user.id}`}
        style={[styles.roleButton, promote ? styles.roleButtonPromote : styles.roleButtonDemote, lastAdmin && styles.roleButtonDisabled]}
      >
        <Text style={[styles.roleButtonLabel, promote ? styles.roleButtonLabelPromote : styles.roleButtonLabelDemote]}>
          {lastAdmin ? 'Último admin' : promote ? 'Tornar admin' : 'Remover admin'}
        </Text>
      </Pressable>
    </View>
  );
}

function RoleChangeSheet({ target, lastAdmin, onClose }: {
  target: AdminUser | null;
  lastAdmin: boolean;
  onClose: () => void;
}) {
  const styles = useStyles();
  const setRole = useSetAdminUserRole();
  if (!target) return null;
  const nextRole: AppRole = target.role === 'admin' ? 'member' : 'admin';
  const guardedClose = () => {
    if (setRole.isPending) return;
    onClose();
  };

  return (
    <Sheet visible title={nextRole === 'admin' ? 'Conceder cargo de admin?' : 'Remover cargo de admin?'} onClose={guardedClose}>
      <View style={styles.sheetBody}>
        <View style={styles.sheetUserRow}>
          <Avatar uri={target.avatar_url} crop={target.avatar_crop} name={target.name} size={48} />
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>{target.name || 'Membro'}</Text>
            <Text style={styles.userEmail} numberOfLines={1}>{target.email || 'Sem email público'}</Text>
          </View>
        </View>

        <Text style={styles.sheetDescription}>
          {nextRole === 'admin'
            ? 'Essa pessoa poderá definir jogos, encerrar ciclos e gerenciar os cargos de todos os usuários.'
            : 'Essa pessoa perderá acesso à administração e não poderá mais alterar jogos ou cargos.'}
        </Text>

        {lastAdmin ? (
          <Text style={styles.sheetError} accessibilityRole="alert">O sistema precisa manter pelo menos um administrador.</Text>
        ) : setRole.isError ? (
          <Text style={styles.sheetError} accessibilityRole="alert">{setRole.error.message}</Text>
        ) : null}

        <View style={styles.sheetActions}>
          <Button label="Cancelar" variant="secondary" disabled={setRole.isPending} onPress={onClose} style={styles.sheetActionButton} />
          <Button
            label="Confirmar alteração"
            variant={nextRole === 'admin' ? 'primary' : 'danger'}
            loading={setRole.isPending}
            disabled={lastAdmin}
            accessibilityLabel="Confirmar alteração de cargo"
            style={styles.sheetActionButton}
            onPress={() => setRole.mutate({ targetUserId: target.id, role: nextRole }, {
              onSuccess: onClose,
            })}
          />
        </View>
      </View>
    </Sheet>
  );
}

const useStyles = themedStyles(colors => ({
  container: { gap: spacing.md },
  search: {
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 14,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryText: { ...typography.tiny, color: colors.zinc500 },
  list: { gap: spacing.sm },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairlineSoft,
    backgroundColor: colors.surfaceSofter,
    padding: spacing.sm,
  },
  userInfo: { flex: 1, minWidth: 0, gap: 2 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  userName: { ...typography.small, color: colors.foreground, fontWeight: '800', flexShrink: 1 },
  userEmail: { ...typography.tiny, color: colors.zinc500, textTransform: 'none' },
  selfBadge: { ...typography.tiny, color: colors.violet300 },
  roleButton: { height: 34, paddingHorizontal: spacing.sm, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  roleButtonPromote: { backgroundColor: 'rgba(139,92,246,0.15)' },
  roleButtonDemote: { backgroundColor: 'rgba(239,68,68,0.1)' },
  roleButtonDisabled: { backgroundColor: colors.surfaceSoft },
  roleButtonLabel: { fontSize: 10, fontWeight: '800' },
  roleButtonLabelPromote: { color: colors.violet300 },
  roleButtonLabelDemote: { color: colors.red300 },
  sheetBody: { padding: spacing.lg, gap: spacing.lg },
  sheetUserRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sheetDescription: { ...typography.small, color: colors.zinc400, lineHeight: 18 },
  sheetError: { ...typography.small, color: colors.red300 },
  sheetActions: { flexDirection: 'row', gap: spacing.sm },
  sheetActionButton: { flex: 1 },
}));
