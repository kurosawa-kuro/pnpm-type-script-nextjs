'use client'
import { useEffect, useState } from 'react';
import { logBasicAction } from "../actions/logBasicActions";

type LogState = {
  message: string;
  requestId: string;
  timestamp: string;
  duration: string;
};

export default function ClientForm() {
  const [state, setState] = useState<LogState>({
    message: '',
    requestId: '',
    timestamp: '',
    duration: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await logBasicAction();
    setState(result);
  };

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
        <div className="flex gap-4 items-center flex-col sm:flex-row">
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <button
                type="submit"
                className="rounded-full border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5"
              >
                Log Action Test
              </button>
              {state.message && (
                <div className="text-sm font-mono bg-black/[.05] dark:bg-white/[.06] p-2 rounded">
                  <p>Status: {state.message}</p>
                  <p>Request ID: {state.requestId}</p>
                  <p>Time: {state.timestamp}</p>
                  <p>Duration: {state.duration}</p>
                </div>
              )}
            </div>
          </form>
        </div>
      </main>
    </div>
  );
} 