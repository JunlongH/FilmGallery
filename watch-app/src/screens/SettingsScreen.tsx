import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { api } from '../services/api';
import { discoverPort, cleanIpAddress } from '../utils/portDiscovery';

const SettingsScreen: React.FC = () => {
  const [serverURL, setServerURL] = useState('');
  const [ipAddress, setIpAddress] = useState(''); // For auto-discovery
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const url = await api.loadServerURL();
      setServerURL(url);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-discover port from IP address
  const handleAutoDiscover = async () => {
    const ip = cleanIpAddress(ipAddress || serverURL);
    if (!ip) {
      Alert.alert('提示', '请输入服务器 IP 地址');
      return;
    }
    
    setDiscovering(true);
    try {
      const result = await discoverPort(ip);
      if (result) {
        setServerURL(result.fullUrl);
        Alert.alert(
          '发现服务', 
          `已找到 FilmGallery 服务\n地址: ${result.fullUrl}\n版本: ${result.version}`
        );
      } else {
        Alert.alert(
          '未找到服务', 
          '在常用端口上未发现 FilmGallery 服务。\n请检查:\n1. IP 地址是否正确\n2. 电脑上的 FilmGallery 是否已启动\n3. 防火墙是否允许连接'
        );
      }
    } catch (e: any) {
      Alert.alert('错误', e.message || '发现过程出错');
    } finally {
      setDiscovering(false);
    }
  };

  const handleSave = async () => {
    if (!serverURL.trim()) {
      Alert.alert('Error', 'Server URL cannot be empty');
      return;
    }

    // Basic URL validation
    if (!serverURL.startsWith('http://') && !serverURL.startsWith('https://')) {
      Alert.alert('Error', 'Server URL must start with http:// or https://');
      return;
    }

    try {
      setSaving(true);
      await api.saveServerURL(serverURL.trim());
      Alert.alert('Success', 'Server URL saved successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Settings</Text>
      
      {/* Auto Discovery Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔍 自动发现 (推荐)</Text>
        <Text style={styles.hint}>
          只需输入电脑的 IP 地址，自动发现服务端口
        </Text>
        <View style={styles.discoverRow}>
          <TextInput
            style={[styles.input, styles.ipInput]}
            value={ipAddress}
            onChangeText={setIpAddress}
            placeholder="192.168.1.100"
            placeholderTextColor="#666"
            keyboardType="numeric"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.discoverButton, discovering && styles.saveButtonDisabled]}
            onPress={handleAutoDiscover}
            disabled={discovering}
          >
            {discovering ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.discoverButtonText}>发现</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Manual Configuration Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>手动配置</Text>
        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={styles.input}
          value={serverURL}
          onChangeText={setServerURL}
          placeholder="http://xxx.xxx.xx.xxx:4000"
          placeholderTextColor="#666"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>
          完整服务器地址（自动发现后会自动填入）
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Save</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  header: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 14,
  },
  ipInput: {
    flex: 1,
    marginRight: 8,
  },
  discoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  discoverButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  discoverButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  hint: {
    color: '#666',
    fontSize: 12,
    marginTop: 6,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonDisabled: {
    backgroundColor: '#666',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SettingsScreen;
