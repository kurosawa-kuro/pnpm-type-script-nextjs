'use client';

import { useState } from 'react';

interface HealthStatus {
  status: string;
  timestamp: string;
}

export default function SystemHealthCheck() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const checkHealth = async () => {
    setLoading(true);
    try {
      const response = await fetch('/health');
      if (!response.ok) {
        throw new Error('システムの状態確認に失敗しました');
      }
      const data = await response.json();
      setHealth(data);
    } catch (error) {
      console.error('Health check error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-4">
      <button
        onClick={checkHealth}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors duration-200 disabled:bg-gray-400"
      >
        {loading ? '確認中...' : 'システム状態確認'}
      </button>

      {health && (
        <div className="mt-2">
          <p>ステータス: {health.status}</p>
        </div>
      )}
    </div>
  );
}