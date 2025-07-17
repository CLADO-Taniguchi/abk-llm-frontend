'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">グローバルエラーが発生しました</h2>
            <p className="text-gray-600 mb-4">申し訳ございません。システムエラーが発生しました。</p>
            <button
              onClick={() => reset()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              リロード
            </button>
          </div>
        </div>
      </body>
    </html>
  );
} 