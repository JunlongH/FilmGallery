import React, { useEffect, useState } from 'react';
import { Button, Card, CardBody, Input, Spinner } from '@heroui/react';
import { ShieldCheck, ShieldAlert, Wifi } from 'lucide-react';
import { getAuthStatus, setupAccount, login, logout } from '../../api/auth';
import {
  getApiBase, setAuthToken, getAuthToken, clearAuthToken,
  setOnUnauthorized, isRemoteMode,
} from '../../api/core';

export default function PairingSettings({ manageUnauthorized = true }) {
  const remote = isRemoteMode();
  const [configured, setConfigured] = useState(null);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(getAuthToken());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getAuthStatus().then((res) => setConfigured(!!res.configured)).catch(() => setConfigured(null));
    if (!manageUnauthorized) return undefined;
    setOnUnauthorized(() => {
      clearAuthToken();
      setToken(null);
      setError('登录已失效，请重新输入账户密码');
    });
    return () => setOnUnauthorized(null);
  }, [manageUnauthorized]);

  const submit = async () => {
    if (!username.trim() || password.length < 12) {
      setError('用户名不能为空，密码至少需要 12 个字符');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (!configured && !remote) {
        await setupAccount(username.trim(), password);
        setConfigured(true);
      }
      const res = await login(username.trim(), password);
      setAuthToken(res.token);
      setToken(res.token);
      setPassword('');
      window.dispatchEvent(new Event('fg-authenticated'));
    } catch (e) {
      clearAuthToken();
      setToken(null);
      setError(e?.message || '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    try { await logout(); } catch (_) {}
    clearAuthToken();
    setToken(null);
  };

  const title = remote ? (token ? '已登录' : '登录远程服务器') : (token ? '已登录' : (configured ? '账户认证已设置' : '设置服务器账户'));
  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <Card>
        <CardBody className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
              {token || (!remote && configured) ? <ShieldCheck className="w-5 h-5 text-success" /> : <ShieldAlert className="w-5 h-5 text-warning" />}
            </div>
            <div>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">服务器地址：{getApiBase()}</p>
            </div>
          </div>

          {configured === null ? <div className="flex justify-center py-8"><Spinner /></div> : token ? (
            <Button color="danger" variant="flat" size="sm" onPress={disconnect}>退出登录</Button>
          ) : (
            <div className="space-y-4">
              {error && <div className="p-3 rounded-lg bg-danger-50 text-danger text-sm">{error}</div>}
              <Input label="账户名" labelPlacement="outside" value={username} onValueChange={setUsername} autoComplete="username" />
              <Input
                label="密码"
                labelPlacement="outside"
                type="password"
                value={password}
                onValueChange={setPassword}
                autoComplete="current-password"
                description="密码至少需要 12 个字符"
                isInvalid={password.length > 0 && password.length < 12}
                errorMessage={`密码至少需要 12 个字符（当前已输入 ${password.length} 个）`}
              />
              <Button color="primary" onPress={submit} isLoading={busy} isDisabled={!username.trim() || password.length < 12}>
                <Wifi className="w-4 h-4 mr-2" /> {configured ? '登录' : '设置并登录'}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
