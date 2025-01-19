'use client';

import { useState } from 'react';

// 共通の型定義
interface BaseMetrics {
  status: string;
  timestamp?: string;
  error?: string;
}

interface HealthStatus extends BaseMetrics {
  timestamp: string;
}

interface LogBase extends BaseMetrics {
  requestId: string;
  message: string;
  timestamp: string;
  duration: number;
}

interface InfoLog extends LogBase {
  details: {
    environment: string;
    apiVersion: string;
  };
}

interface ErrorLog extends LogBase {
  errorCode: string;
  severity: string;
  stack?: string;
}

interface CpuMetrics extends BaseMetrics {
  metrics: {
    startTime: number;
    cpuDuration: number;
  };
  totalDuration: number;
}

interface MemoryMetrics extends BaseMetrics {
  metrics: {
    startTime: number;
    memoryUsage: NodeJS.MemoryUsage;
    memoryUsageAfter?: NodeJS.MemoryUsage;
    asyncDuration: number;
  };
  totalDuration: number;
}

// メトリクス設定の定義
const METRICS_CONFIG = {
  health: {
    endpoint: '/health',
    buttonColor: 'blue',
    title: 'システム状態',
    loadingText: 'システム状態確認中...',
    buttonText: 'システム状態確認',
  },
  info: {
    endpoint: '/api/log/info',
    buttonColor: 'green',
    title: '情報ログ',
    loadingText: '情報ログ確認中...',
    buttonText: '情報ログ確認',
  },
  error: {
    endpoint: '/api/log/error',
    buttonColor: 'red',
    title: 'エラーログ',
    loadingText: 'エラーログ確認中...',
    buttonText: 'エラーログ確認',
  },
  cpu: {
    endpoint: '/api/metrics/cpu-test',
    buttonColor: 'purple',
    title: 'CPU負荷テスト結果',
    loadingText: 'CPU負荷テスト実行中...',
    buttonText: 'CPU負荷テスト',
  },
  memory: {
    endpoint: '/api/metrics/memory-test',
    buttonColor: 'yellow',
    title: 'メモリテスト結果',
    loadingText: 'メモリテスト実行中...',
    buttonText: 'メモリテスト',
  },
} as const;

export default function SystemCheck() {
  // 状態管理
  const [metrics, setMetrics] = useState<{
    health: HealthStatus | null;
    info: InfoLog | null;
    error: ErrorLog | null;
    cpu: CpuMetrics | null;
    memory: MemoryMetrics | null;
  }>({
    health: null,
    info: null,
    error: null,
    cpu: null,
    memory: null,
  });
  const [loading, setLoading] = useState<keyof typeof METRICS_CONFIG | null>(null);

  // 共通のフェッチ処理
  const fetchMetrics = async (type: keyof typeof METRICS_CONFIG) => {
    setLoading(type);
    try {
      const response = await fetch(METRICS_CONFIG[type].endpoint);
      const data = await response.json();
      setMetrics(prev => ({ ...prev, [type]: data }));
    } catch (error) {
      console.error(`${type} metrics fetch error:`, error);
    } finally {
      setLoading(null);
    }
  };

  // 結果表示コンポーネント
  const MetricsCard = ({ 
    type, 
    data 
  }: { 
    type: keyof typeof METRICS_CONFIG;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
  }) => {
    if (!data) return null;

    const config = METRICS_CONFIG[type];
    const borderColor = `border-${config.buttonColor}-500`;
    const titleColor = `text-${config.buttonColor}-400`;

    const renderContent = () => {
      switch (type) {
        case 'error':
          return (
            <div className="space-y-2 text-gray-200">
              <p>ステータス: {data.status}</p>
              <p>エラーコード: {data.errorCode}</p>
              <p>メッセージ: {data.message}</p>
              <p>重要度: {data.severity}</p>
              {/* スタックトレースは最初の行のみ表示 */}
              {data.stack && (
                <p>スタックトレース: {data.stack.split('\n')[0]}</p>
              )}
            </div>
          );
        case 'memory':
          return (
            <div className="space-y-2 text-gray-200">
              <p>ステータス: {data.status}</p>
              {data.metrics?.memoryUsageAfter && (
                <>
                  <p>メモリ使用量（開始時）: {Math.round(data.metrics.memoryUsage.heapUsed / 1024 / 1024)}MB</p>
                  <p>メモリ使用量（終了時）: {Math.round(data.metrics.memoryUsageAfter.heapUsed / 1024 / 1024)}MB</p>
                </>
              )}
              <p>総実行時間: {data.totalDuration}ms</p>
            </div>
          );
        default:
          return (
            <div className="space-y-2 text-gray-200">
              {Object.entries(data).map(([key, value]) => {
                if (typeof value === 'object') return null;
                return (
                  <p key={key}>
                    {key}: {String(value)}
                  </p>
                );
              })}
            </div>
          );
      }
    };

    return (
      <div className={`p-4 bg-gray-800 rounded-lg shadow border ${borderColor}`}>
        <h3 className={`font-bold text-lg mb-2 ${titleColor}`}>{config.title}</h3>
        {renderContent()}
      </div>
    );
  };

  return (
    <div className="p-4">
      <div className="flex flex-wrap gap-4 mb-8">
        {Object.entries(METRICS_CONFIG).map(([type, config]) => (
          <button
            key={type}
            onClick={() => fetchMetrics(type as keyof typeof METRICS_CONFIG)}
            disabled={loading === type}
            className={`px-4 py-2 bg-${config.buttonColor}-500 text-white rounded-md 
                      hover:bg-${config.buttonColor}-600 transition-colors duration-200 
                      disabled:bg-gray-400`}
          >
            {loading === type ? config.loadingText : config.buttonText}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(Object.keys(METRICS_CONFIG) as Array<keyof typeof METRICS_CONFIG>).map(type => (
          <MetricsCard key={type} type={type} data={metrics[type]} />
        ))}
      </div>
    </div>
  );
} 