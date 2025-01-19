'use client';

import { useState } from 'react';

interface HealthStatus {
  status: string;
  timestamp: string;
}

interface InfoLog {
  status: string;
  requestId: string;
  message: string;
  details: {
    environment: string;
    apiVersion: string;
  };
  timestamp: string;
  duration: number;
}

interface ErrorLog {
  status: string;
  requestId: string;
  message: string;
  errorCode: string;
  severity: string;
  stack?: string;
  timestamp: string;
  duration: number;
}

interface CpuMetrics {
  status: string;
  metrics: {
    startTime: number;
    cpuDuration: number;
  };
  totalDuration: number;
  error?: string;
}

interface MemoryMetrics {
  status: string;
  metrics: {
    startTime: number;
    memoryUsage: NodeJS.MemoryUsage;
    memoryUsageAfter?: NodeJS.MemoryUsage;
    asyncDuration: number;
  };
  totalDuration: number;
  error?: string;
}

export default function SystemHealthCheck() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [info, setInfo] = useState<InfoLog | null>(null);
  const [error, setError] = useState<ErrorLog | null>(null);
  const [cpuMetrics, setCpuMetrics] = useState<CpuMetrics | null>(null);
  const [memoryMetrics, setMemoryMetrics] = useState<MemoryMetrics | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const checkHealth = async () => {
    setLoading('health');
    try {
      const response = await fetch('/health');
      const data = await response.json();
      setHealth(data);
    } catch (error) {
      console.error('Health check error:', error);
    } finally {
      setLoading(null);
    }
  };

  const checkInfo = async () => {
    setLoading('info');
    try {
      const response = await fetch('/api/log/info');
      const data = await response.json();
      setInfo(data);
    } catch (error) {
      console.error('Info check error:', error);
    } finally {
      setLoading(null);
    }
  };

  const checkError = async () => {
    setLoading('error');
    try {
      const response = await fetch('/api/log/error');
      const data = await response.json();
      setError(data);
    } catch (error) {
      console.error('Error check error:', error);
    } finally {
      setLoading(null);
    }
  };

  const checkCpuMetrics = async () => {
    setLoading('cpu');
    try {
      const response = await fetch('/api/metrics/cpu-test');
      const data = await response.json();
      setCpuMetrics(data);
    } catch (error) {
      console.error('CPU metrics check error:', error);
    } finally {
      setLoading(null);
    }
  };

  const checkMemoryMetrics = async () => {
    setLoading('memory');
    try {
      const response = await fetch('/api/metrics/memory-test');
      const data = await response.json();
      setMemoryMetrics(data);
    } catch (error) {
      console.error('Memory metrics check error:', error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="p-4">
      <div className="flex flex-wrap gap-4 mb-8">
        <button
          onClick={checkHealth}
          disabled={loading === 'health'}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors duration-200 disabled:bg-gray-400"
        >
          {loading === 'health' ? '確認中...' : 'システム状態確認'}
        </button>

        <button
          onClick={checkInfo}
          disabled={loading === 'info'}
          className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors duration-200 disabled:bg-gray-400"
        >
          {loading === 'info' ? '確認中...' : '情報ログ確認'}
        </button>

        <button
          onClick={checkError}
          disabled={loading === 'error'}
          className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-200 disabled:bg-gray-400"
        >
          {loading === 'error' ? '確認中...' : 'エラーログ確認'}
        </button>

        <button
          onClick={checkCpuMetrics}
          disabled={loading === 'cpu'}
          className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors duration-200 disabled:bg-gray-400"
        >
          {loading === 'cpu' ? '確認中...' : 'CPU負荷テスト'}
        </button>

        <button
          onClick={checkMemoryMetrics}
          disabled={loading === 'memory'}
          className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors duration-200 disabled:bg-gray-400"
        >
          {loading === 'memory' ? '確認中...' : 'メモリテスト'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {health && (
          <div className="p-4 bg-gray-800 rounded-lg shadow border border-blue-500">
            <h3 className="font-bold text-lg mb-2 text-blue-400">システム状態</h3>
            <div className="space-y-2 text-gray-200">
              <p>ステータス: {health.status}</p>
              <p>タイムスタンプ: {health.timestamp}</p>
            </div>
          </div>
        )}

        {info && (
          <div className="p-4 bg-gray-800 rounded-lg shadow border border-green-500">
            <h3 className="font-bold text-lg mb-2 text-green-400">情報ログ</h3>
            <div className="space-y-2 text-gray-200">
              <p>ステータス: {info.status}</p>
              <p>メッセージ: {info.message}</p>
              <p>環境: {info.details.environment}</p>
              <p>APIバージョン: {info.details.apiVersion}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-gray-800 rounded-lg shadow border border-red-500">
            <h3 className="font-bold text-lg mb-2 text-red-400">エラーログ</h3>
            <div className="space-y-2 text-gray-200">
              <p>ステータス: {error.status}</p>
              <p>エラーコード: {error.errorCode}</p>
              <p>メッセージ: {error.message}</p>
              <p>重要度: {error.severity}</p>
            </div>
          </div>
        )}

        {cpuMetrics && (
          <div className="p-4 bg-gray-800 rounded-lg shadow border border-purple-500">
            <h3 className="font-bold text-lg mb-2 text-purple-400">CPU負荷テスト結果</h3>
            <div className="space-y-2 text-gray-200">
              <p>ステータス: {cpuMetrics.status}</p>
              <p>CPU処理時間: {cpuMetrics.metrics.cpuDuration}ms</p>
              <p>総実行時間: {cpuMetrics.totalDuration}ms</p>
              {cpuMetrics.error && <p className="text-red-400">エラー: {cpuMetrics.error}</p>}
            </div>
          </div>
        )}

        {memoryMetrics && (
          <div className="p-4 bg-gray-800 rounded-lg shadow border border-yellow-500">
            <h3 className="font-bold text-lg mb-2 text-yellow-400">メモリテスト結果</h3>
            <div className="space-y-2 text-gray-200">
              <p>ステータス: {memoryMetrics.status}</p>
              <p>非同期処理時間: {memoryMetrics.metrics.asyncDuration}ms</p>
              <p>総実行時間: {memoryMetrics.totalDuration}ms</p>
              {memoryMetrics.metrics.memoryUsageAfter && (
                <>
                  <p>メモリ使用量（開始時）: {Math.round(memoryMetrics.metrics.memoryUsage.heapUsed / 1024 / 1024)}MB</p>
                  <p>メモリ使用量（終了時）: {Math.round(memoryMetrics.metrics.memoryUsageAfter.heapUsed / 1024 / 1024)}MB</p>
                </>
              )}
              {memoryMetrics.error && <p className="text-red-400">エラー: {memoryMetrics.error}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 