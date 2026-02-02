import React from 'react';
import { Button } from '@heroui/react';
import { RefreshCw } from 'lucide-react';

function FloatingRefreshButton({ onRefresh }) {
  return (
    <Button
      isIconOnly
      variant="shadow"
      size="lg"
      radius="full"
      onPress={onRefresh}
      aria-label="强制刷新并清除缓存"
      className="
        fixed bottom-6 right-6 z-50
        bg-zinc-200/60 dark:bg-zinc-700/60
        hover:bg-zinc-300 dark:hover:bg-zinc-600
        text-zinc-600 dark:text-zinc-300
        hover:text-zinc-900 dark:hover:text-white
        backdrop-blur-sm
        opacity-40 hover:opacity-100
        transition-all duration-300 ease-out
        hover:scale-110
        shadow-lg hover:shadow-xl
      "
      style={{
        width: '48px',
        height: '48px',
      }}
    >
      <RefreshCw className="w-5 h-5" />
    </Button>
  );
}

export default FloatingRefreshButton;
