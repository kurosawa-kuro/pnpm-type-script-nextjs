'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

interface User {
  id: string;
  email: string;
  image_path: string;
  createdAt: string;
  updatedAt: string;
}

export default function UserList() {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      const response = await fetch('/api/users');
      const data = await response.json();
      console.log('Users data:', data);
      setUsers(data);
    };

    fetchUsers();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {users.map((user) => (
        <div key={user.id} className="border rounded-lg p-4">
          <div className="relative w-full h-48 mb-4">
            {user.image_path && (
              <Image
                src={`https://drrqxf7gq2h3o.cloudfront.net/${user.image_path}`}
                alt={user.email}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                priority
                className="object-cover rounded"
              />
            )}
          </div>
          <p className="text-gray-600">{user.email}</p>
          <p className="text-sm text-gray-500">
            登録日: {new Date(user.createdAt).toLocaleDateString('ja-JP')}
          </p>
        </div>
      ))}
    </div>
  );
}