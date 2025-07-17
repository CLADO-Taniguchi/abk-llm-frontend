
'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'ai',
      content: 'こんにちは！あなぶき興産データ分析システムへようこそ。物件情報、顧客データ、Webアクセスログなどについて、日本語でご質問ください。',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null); // セッション管理
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // 会話履歴を構築（AIメッセージのみ）
      const conversationHistory = messages
        .filter(msg => msg.type === 'ai')
        .slice(-5) // 最新5件のAI応答のみ
        .map(msg => ({
          query: '', // 実際の実装では対応するユーザーメッセージを取得
          response: msg.content,
          timestamp: msg.timestamp.toISOString(),
          queryType: 'unknown'
        }));

      // n8nワークフローAPI呼び出し
      // 直接n8nにアクセス（CORS対応が必要）
      const n8nUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || 'https://clado.app.n8n.cloud/webhook/abk-ask';
      const timeout = parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || '30000');
      
      // タイムアウト付きfetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      let response;
      try {
        response = await fetch(n8nUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: userMessage.content,
            timestamp: userMessage.timestamp.toISOString(),
            sessionId: currentSessionId, // 既存のセッションIDを送信（初回はnull）
            conversationHistory: conversationHistory
          }),
          signal: controller.signal
        });
      } catch (fetchError: any) {
        if (fetchError.name === 'AbortError') {
          const timeoutMessage: Message = {
            id: Date.now().toString(),
            type: 'ai',
            content: '⏱️ リクエストがタイムアウトしました。\n\nデータ処理に時間がかかっています。もう一度お試しいただくか、より具体的な条件でクエリを絞り込んでください。',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, timeoutMessage]);
          setIsLoading(false);
          return;
        }
        throw fetchError;
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorData = await response.json();
        
        // n8nワークフロー無効エラーの場合、詳細メッセージを表示
        if (errorData.error === 'n8nワークフローが無効です') {
          const aiMessage: Message = {
            id: Date.now().toString(),
            type: 'ai',
            content: `⚠️ ${errorData.explanation}\n\n💡 ${errorData.hint}`,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, aiMessage]);
          setIsLoading(false);
          return;
        }
        
        // その他のエラーの場合
        const aiMessage: Message = {
          id: Date.now().toString(),
          type: 'ai',
          content: `❌ エラー: ${errorData.error || 'API呼び出しに失敗しました'}\n\n${errorData.explanation || 'もう一度お試しください。'}`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMessage]);
        setIsLoading(false);
        return;
      }

      let data;
      const responseText = await response.text();
      
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        console.error('Response Text:', responseText);
        const errorMessage: Message = {
          id: Date.now().toString(),
          type: 'ai',
          content: '⚠️ サーバーからの応答が不正です。n8nワークフローが正しく設定されているか確認してください。',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
        setIsLoading(false);
        return;
      }
      
      // n8nから直接レスポンスを受け取る場合
      const sessionId = currentSessionId || `session-${Date.now()}`;
      if (!currentSessionId) {
        setCurrentSessionId(sessionId);
      }
      
      // デバッグ用：レスポンスの内容をコンソールに出力
      console.log('n8n Response:', data);
      
      // より詳細なレスポンスを表示
      let aiContent = '';
      
      // エラーがある場合
      if (data.error) {
        aiContent = `⚠️ エラーが発生しました: ${data.error}`;
        if (data.error_details) {
          aiContent += `\n\n詳細: ${data.error_details}`;
        }
      } else if (data.success === false) {
        aiContent = '⚠️ クエリの実行に失敗しました。';
      } else if (data.success === true) {
        // 成功時の処理
        aiContent = 'データ分析が完了しました。';
        
        // 元のクエリを表示
        if (data.webhook_query) {
          aiContent = `「${data.webhook_query}」についてデータを分析しました。`;
        }
      }
      
      // SQLクエリが生成された場合、追加情報を表示
      if (data.claude_sql) {
        aiContent += `\n\n実行したクエリ:\n\`\`\`sql\n${data.claude_sql}\n\`\`\``;
      }
      
      // 結果データがある場合、簡潔に表示
      if (data.redshift_results) {
        const results = data.redshift_results;
        if (Array.isArray(results) && results.length > 0) {
          aiContent += `\n\n📊 結果: ${results.length}件のデータを取得しました。`;
          
          // テーブル形式で表示（最初の5件）
          const displayResults = results.slice(0, 5);
          if (displayResults.length > 0) {
            // カラム名を取得
            const columns = Object.keys(displayResults[0]);
            
            // 簡易的なテーブル形式
            aiContent += '\n\n';
            aiContent += '| ' + columns.join(' | ') + ' |\n';
            aiContent += '|' + columns.map(() => '---').join('|') + '|\n';
            
            displayResults.forEach(row => {
              aiContent += '| ' + columns.map(col => {
                const value = row[col];
                if (value === null || value === undefined) return '-';
                if (typeof value === 'number' && col.includes('amount')) {
                  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(value);
                }
                return String(value);
              }).join(' | ') + ' |\n';
            });
            
            if (results.length > 5) {
              aiContent += `\n... 他 ${results.length - 5} 件のデータ`;
            }
          }
        } else if (Array.isArray(results) && results.length === 0) {
          aiContent += '\n\n📭 該当するデータが見つかりませんでした。';
        } else if (typeof results === 'object' && Object.keys(results).length > 0) {
          // オブジェクトの場合、整形して表示
          aiContent += '\n\n📊 結果:\n';
          Object.entries(results).forEach(([key, value]) => {
            aiContent += `• ${key}: ${value}\n`;
          });
        }
      }
      
      // 実行時間を表示
      if (data.execution_time) {
        const executionDate = new Date(data.execution_time);
        aiContent += `\n\n実行時刻: ${executionDate.toLocaleString('ja-JP')}`;
      }
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: aiContent,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('API Error:', error);
      let errorContent = '申し訳ございません。エラーが発生しました。';
      
      if (error instanceof Error) {
        if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
          errorContent = '🌐 ネットワークエラー\n\nサーバーに接続できませんでした。インターネット接続を確認してください。';
        } else if (error.message.includes('CORS')) {
          errorContent = '🔒 CORS エラー\n\nn8nワークフローのCORS設定を確認してください。';
        } else {
          errorContent = `⚠️ エラーが発生しました\n\n${error.message}`;
        }
      }
       
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: errorContent,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickQuery = (query: string) => {
    setInputValue(query);
  };

  const sampleQueries = [
    '都道府県別の顧客数',
    '物件のコンバージョン履歴',
    '県別の顧客情報',
    '最新のWebアクセス',
    '家族構成の分布',
    'モデルルームの来場者数',
    '成約までの期間',
  ];

  return (
    <div 
      className="min-h-screen relative"
      style={{
        backgroundImage: `url('/images/takamatsu.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Overlay for better text readability */}
      <div className="absolute inset-0 bg-white/60 backdrop-blur-sm"></div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="bg-white/95 backdrop-blur-sm border-b border-blue-200 shadow-sm">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                                  <h1 className="text-2xl font-bold text-blue-900" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                  ABK あなぶき興産データ分析システム
                </h1>
              </div>
            </div>
          </div>
        </header>

        {/* Main Chat Area */}
        <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 py-6">
          {/* Messages Container */}
          <div className="flex-1 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-blue-200 mb-6 overflow-hidden flex flex-col">
            {/* Messages List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4" style={{ maxHeight: '500px' }}>
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-2xl p-4 ${
                    message.type === 'user' 
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white' 
                      : 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-800'
                  }`}>
                    <p className="text-sm leading-relaxed">{message.content}</p>
                    <p className={`text-xs mt-2 ${
                      message.type === 'user' ? 'text-blue-100' : 'text-gray-500'
                    }`}>
                      {message.timestamp.toLocaleTimeString('ja-JP', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                </div>
              ))}
              
              {/* Loading indicator */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gradient-to-r from-gray-100 to-gray-200 rounded-2xl p-4 max-w-[70%]">
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin"></div>
                      <span className="text-gray-600 text-sm">分析中...</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-blue-200 p-4 bg-white/50">
              <form onSubmit={handleSubmit} className="flex space-x-3">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="データに関する質問を日本語で入力してください..."
                  className="flex-1 px-4 py-3 border-2 border-blue-200 rounded-xl focus:border-blue-400 focus:outline-none text-blue-800 placeholder-gray-500 bg-white/80"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isLoading}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  <i className="ri-send-plane-fill text-lg"></i>
                </button>
              </form>
            </div>
          </div>

          {/* Quick Query Buttons */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-4 border border-blue-200 shadow-lg">
            <h3 className="text-sm font-semibold text-blue-800 mb-3 flex items-center">
              <i className="ri-lightbulb-line text-blue-500 mr-2"></i>
              よく使われる質問例：
            </h3>
            <div className="flex flex-wrap gap-2">
              {sampleQueries.map((sample, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickQuery(sample)}
                  className="px-3 py-1.5 bg-gradient-to-r from-blue-100 to-sky-100 text-blue-700 rounded-full hover:from-blue-200 hover:to-sky-200 transition-all duration-200 text-xs font-medium border border-blue-300 hover:border-blue-400"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-white/95 backdrop-blur-sm border-t border-blue-200 py-4">
          <div className="max-w-6xl mx-auto px-6 text-center">
            <p className="text-sm text-blue-600">
              Powered by ABK あなぶき興産データ分析システム
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
