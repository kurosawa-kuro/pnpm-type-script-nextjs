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

export default function SystemHealthCheck() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [info, setInfo] = useState<InfoLog | null>(null);
  const [error, setError] = useState<ErrorLog | null>(null);
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

  return (
    <div className="space-y-4">
      <div>
        <button
          onClick={checkHealth}
          disabled={loading === 'health'}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors duration-200 disabled:bg-gray-400"
        >
          {loading === 'health' ? '確認中...' : 'システム状態確認'}
        </button>
        {health && (
          <div className="mt-2">
            <p>ステータス: {health.status}</p>
            <p>タイムスタンプ: {health.timestamp}</p>
          </div>
        )}
      </div>

      <div>
        <button
          onClick={checkInfo}
          disabled={loading === 'info'}
          className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors duration-200 disabled:bg-gray-400"
        >
          {loading === 'info' ? '確認中...' : '情報ログ確認'}
        </button>
        {info && (
          <div className="mt-2">
            <p>ステータス: {info.status}</p>
            <p>メッセージ: {info.message}</p>
            <p>環境: {info.details.environment}</p>
            <p>APIバージョン: {info.details.apiVersion}</p>
          </div>
        )}
      </div>


      <div>
        <button
          onClick={checkError}
          disabled={loading === 'error'}
          className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-200 disabled:bg-gray-400"
        >
          {loading === 'error' ? '確認中...' : 'エラーログ確認'}
        </button>
        {error && (
          <div className="mt-2">
            <p>ステータス: {error.status}</p>
            <p>エラーコード: {error.errorCode}</p>
            <p>メッセージ: {error.message}</p>
            <p>重要度: {error.severity}</p>
          </div>
        )}
      </div>
    </div>
  );
} 