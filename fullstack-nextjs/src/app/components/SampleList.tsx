'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

interface Sample {
  id: string;
  data: string;
  image_path: string;
  createdAt: string;
  updatedAt: string;
}

export default function SampleList() {
  const [samples, setSamples] = useState<Sample[]>([]);

  const fetchSamples = async () => {
    const response = await fetch('/api/samples');
    const data = await response.json();
    setSamples(data);
  };

  useEffect(() => {
    fetchSamples();
    // SampleFormで使用するために関数をexport
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).refreshSamples = fetchSamples;
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {samples.map((sample) => (
        <div key={sample.id} className="border rounded-lg p-4">
          <div className="relative w-full h-48 mb-4">
            {sample.image_path && (
              <Image
                src={`https://drrqxf7gq2h3o.cloudfront.net/${sample.image_path}`}
                alt={sample.data}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                priority
                className="object-cover rounded"
              />
            )}
          </div>
          <p className="text-gray-600">{sample.data}</p>
          <p className="text-sm text-gray-500">
            登録日: {new Date(sample.createdAt).toLocaleDateString('ja-JP')}
          </p>
        </div>
      ))}
    </div>
  );
} 