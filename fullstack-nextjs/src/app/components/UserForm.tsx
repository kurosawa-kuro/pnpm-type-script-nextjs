'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UserForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    try {
      setLoading(true);
      
      // Get presigned URL for S3 upload
      const presignedRes = await fetch('/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name }),
      });
      const { url, key } = await presignedRes.json();

      // Upload file to S3
      await fetch(url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      // Create user
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          image_path: key,
        }),
      });

      if (!res.ok) throw new Error('ユーザー作成に失敗しました');

      setEmail('');
      setFile(null);
      router.refresh();
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
        <label htmlFor="email" className="block mb-2">
          メールアドレス
        </label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-3 py-2 border rounded text-black"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="image" className="block mb-2">
          プロフィール画像
        </label>
        <input
          type="file"
          id="image"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
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