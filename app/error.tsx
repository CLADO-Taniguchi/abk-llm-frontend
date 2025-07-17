'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">エラーが発生しました</h2>
        <p className="text-gray-600 mb-4">申し訳ございません。予期しないエラーが発生しました。</p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          もう一度試す
        </button>
      </div>
    </div>
  );
} 