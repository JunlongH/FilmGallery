import React, { useContext, useState } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { TextInput, Button, Text, Switch, useTheme } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiContext } from '../context/ApiContext';
import { discoverPort, cleanIpAddress, validateServer } from '../utils/portDiscovery';

export default function SettingsScreen({ navigation }) {
  const theme = useTheme();
  const { baseUrl, setBaseUrl, backupUrl, setBackupUrl, darkMode, setDarkMode } = useContext(ApiContext);
  const [url, setUrl] = useState(baseUrl);
  const [backup, setBackup] = useState(backupUrl || '');
  const [isDark, setIsDark] = useState(!!darkMode);
  const [ipAddress, setIpAddress] = useState(''); // For auto-discovery
  const [discovering, setDiscovering] = useState(false);

  const cleanUrlString = (input) => {
    let clean = input.trim();
    if (!clean) return '';
    if (clean.endsWith('/')) clean = clean.slice(0, -1);
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    return clean;
  };

  // Auto-discover port from IP address
  const handleAutoDiscover = async () => {
    const ip = cleanIpAddress(ipAddress || url);
    if (!ip) {
      Alert.alert('提示', '请输入服务器 IP 地址');
      return;
    }
    
    setDiscovering(true);
    try {
      const result = await discoverPort(ip);
      if (result) {
        setUrl(result.fullUrl);
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
    } catch (e) {
      Alert.alert('错误', e.message || '发现过程出错');
    } finally {
      setDiscovering(false);
    }
  };

  const save = async () => {
    const cleanUrl = cleanUrlString(url);
    const cleanBackup = cleanUrlString(backup);
    
    await AsyncStorage.setItem('api_base_url', cleanUrl);
    if (cleanBackup) {
      await AsyncStorage.setItem('api_backup_url', cleanBackup);
    } else {
      await AsyncStorage.removeItem('api_backup_url');
    }

    setBaseUrl(cleanUrl);
    setBackupUrl(cleanBackup);
    navigation.goBack();
  };

  const toggleDark = async (val) => {
    setIsDark(val);
    setDarkMode && setDarkMode(val);
    await AsyncStorage.setItem('theme_dark', val ? 'true' : 'false');
  };

  const testConnection = async (targetUrl) => {
    const clean = cleanUrlString(targetUrl);
    if (!clean) {
      alert('Please enter a URL');
      return;
    }
    try {
      const res = await fetch(`${clean}/api/rolls`);
      if (res.ok) {
        alert(`Connection Successful to ${clean}!`);
      } else {
        alert(`Connected to ${clean}, but server returned ${res.status}`);
      }
    } catch (e) {
      alert(`Connection Failed to ${clean}: ${e.message}`);
    }
  };

  const handleSwap = () => {
    setUrl(backup);
    setBackup(url);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Auto Discovery Section */}
      <Text style={styles.sectionTitle}>🔍 自动发现 (推荐)</Text>
      <Text style={styles.hint}>
        只需输入电脑的 IP 地址，自动发现 FilmGallery 服务端口
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <TextInput
          mode="outlined"
          value={ipAddress}
          onChangeText={setIpAddress}
          placeholder="192.168.1.100"
          autoCapitalize="none"
          keyboardType="numeric"
          activeOutlineColor="#5a4632"
          style={{ backgroundColor: '#f5f0e6', flex: 1, marginRight: 8 }}
        />
        <Button 
          mode="contained" 
          onPress={handleAutoDiscover} 
          loading={discovering}
          disabled={discovering}
          buttonColor="#5a4632"
          icon="magnify"
          compact
        >
          发现
        </Button>
      </View>
      
      {/* Manual Configuration Section */}
      <Text style={styles.sectionTitle}>手动配置</Text>
      <Text style={styles.label}>Primary Server URL</Text>
      <Text style={styles.hint}>
        完整服务器地址（自动发现后会自动填入）
      </Text>
      <TextInput
        mode="outlined"
        value={url}
        onChangeText={setUrl}
        placeholder="http://192.168.1.x:4000"
        autoCapitalize="none"
        keyboardType="url"
        activeOutlineColor="#5a4632"
        style={{ backgroundColor: '#f5f0e6', marginBottom: 10 }}
      />

      <View style={{ alignItems: 'center', marginBottom: 10 }}>
        <Button 
          mode="text" 
          compact 
          onPress={handleSwap} 
          icon="swap-vertical" 
          textColor="#5a4632"
        >
          Swap Primary & Backup
        </Button>
      </View>
      
      <Text style={styles.label}>Backup Server URL (Optional)</Text>
      <Text style={styles.hint}>
        Alternative IP address if primary is unreachable.
      </Text>
      <TextInput
        mode="outlined"
        value={backup}
        onChangeText={setBackup}
        placeholder="http://192.168.1.y:4000"
        autoCapitalize="none"
        keyboardType="url"
        activeOutlineColor="#5a4632"
        style={{ backgroundColor: '#f5f0e6', marginBottom: 10 }}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Button mode="outlined" onPress={() => testConnection(url)} style={[styles.button, { flex: 1, marginRight: 8 }]} textColor="#5a4632">
          Test Primary
        </Button>
        <Button mode="outlined" onPress={() => testConnection(backup)} style={[styles.button, { flex: 1, marginLeft: 8 }]} textColor="#5a4632">
          Test Backup
        </Button>
      </View>

      <Button mode="contained" onPress={save} style={styles.button} buttonColor="#5a4632">
        Save Settings
      </Button>
      <View style={{ marginTop: 24 }}>
        <Text style={styles.label}>Dark Mode</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.hint}>Reduce eye strain with a dark UI</Text>
          <Switch value={isDark} onValueChange={toggleDark} />
        </View>
      </View>

      <View style={{ marginTop: 24 }}>
        <Text style={styles.label}>Equipment Library</Text>
        <Text style={styles.hint}>Manage your cameras, lenses, and flashes</Text>
        <Button 
          mode="outlined" 
          onPress={() => navigation.navigate('Equipment')} 
          icon="camera"
          textColor="#5a4632"
          style={{ marginTop: 8 }}
        >
          Open Equipment Library
        </Button>
      </View>
      
      <View style={{ marginTop: 24 }}>
        <Text style={styles.label}>Location Diagnostic (位置诊断)</Text>
        <Text style={styles.hint}>Debug location issues on HyperOS/MIUI devices</Text>
        <Button 
          mode="outlined" 
          onPress={() => navigation.navigate('LocationDiagnostic')} 
          icon="crosshairs-gps"
          textColor="#f59e0b"
          style={{ marginTop: 8 }}
        >
          Open Location Diagnostic
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fdfdfd',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 16,
    color: '#5a4632',
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#5a4632',
  },
  hint: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  button: {
    marginTop: 20,
  },
});
