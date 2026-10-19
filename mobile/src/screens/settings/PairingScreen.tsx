import React, { useState, useCallback } from 'react';
import { useT } from '../../i18n';
import { View, Text, TextInput, Button, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api, saveAuthToken } from '../../api/client';

export default function PairingScreen() {
  const t = useT();
  const navigation = useNavigation<any>();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    if (!username.trim() || password.length < 12) {
      setError(t('pair.invalid'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res: any = await api.http.post('/api/auth/login', { username: username.trim(), password });
      if (!res?.token) throw new Error(t('pair.noToken'));
      await saveAuthToken(res.token);
      setPassword('');
      navigation.navigate('Main');
    } catch (e: any) {
      setError(e?.body?.error || e?.message || t('pair.failed'));
    } finally {
      setLoading(false);
    }
  }, [username, password, navigation, t]);

  const handleCancel = useCallback(() => navigation.goBack(), [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('pair.title')}</Text>
      <Text style={styles.subtitle}>{t('pair.hint')}</Text>
      <TextInput
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        placeholder={t('pair.username')}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder={t('pair.password')}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
      />
      {error && <Text style={styles.error}>{error}</Text>}
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 20 }} />
      ) : (
        <View style={styles.buttonRow}>
          <Button title={t('common.cancel')} onPress={handleCancel} color="#999" />
          <Button title={t('pair.pair')} onPress={handleConnect} disabled={!username.trim() || password.length < 12} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  input: { fontSize: 16, borderWidth: 1, borderColor: '#007AFF', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, width: '100%', maxWidth: 320, marginTop: 12 },
  error: { color: '#FF3B30', fontSize: 14, marginTop: 16, textAlign: 'center' },
  buttonRow: { flexDirection: 'row', gap: 16, marginTop: 24 },
});
