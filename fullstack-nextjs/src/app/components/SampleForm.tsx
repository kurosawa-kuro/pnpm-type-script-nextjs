'use client';

import { useState } from 'react';

export default function SampleForm() {
  const [data, setData] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      
      let key;
      if (file) {
        // Get presigned URL for S3 upload
        const presignedRes = await fetch('/api/upload/presigned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name }),
        });
        const { url, key: uploadKey } = await presignedRes.json();
        key = uploadKey;

        // Upload file to S3
        await fetch(url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
      }

      // Create sample
      const res = await fetch('/api/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data,
          ...(key && { image_path: key }),
        }),
      });

      if (!res.ok) throw new Error('サンプル作成に失敗しました');

      setData('');
      setFile(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).refreshSamples?.();
    } catch (error) {
      console.error(error);
      alert('エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md">
      <div className="mb-4">
        <label htmlFor="data" className="block mb-2">
          データ
        </label>
        <input
          type="text"
          id="data"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="w-full px-3 py-2 border rounded text-black"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="image" className="block mb-2">
          画像（任意）
        </label>
        <input
          type="file"
          id="image"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
      >
        {loading ? '処理中...' : '登録する'}
      </button>
    </form>
  );
} 