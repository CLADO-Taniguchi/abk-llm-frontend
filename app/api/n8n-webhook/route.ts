import { NextRequest, NextResponse } from 'next/server';

// セッション管理用のメモリストア（本番環境ではRedis等を使用）
const sessionStore = new Map<string, {
  sessionId: string;
  createdAt: Date;
  lastAccessAt: Date;
  conversationHistory: any[];
}>();

// セッション有効期限（24時間）
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;

// 期限切れセッションのクリーンアップ
function cleanupExpiredSessions() {
  const now = new Date();
  for (const [sessionId, session] of sessionStore.entries()) {
    if (now.getTime() - session.lastAccessAt.getTime() > SESSION_TIMEOUT) {
      sessionStore.delete(sessionId);
    }
  }
}

// セッションIDの生成または取得
function getOrCreateSession(providedSessionId?: string): string {
  cleanupExpiredSessions();
  
  // 提供されたセッションIDが有効か確認
  if (providedSessionId && sessionStore.has(providedSessionId)) {
    const session = sessionStore.get(providedSessionId)!;
    session.lastAccessAt = new Date();
    return providedSessionId;
  }
  
  // 新しいセッションIDを生成
  const newSessionId = 'api-session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  sessionStore.set(newSessionId, {
    sessionId: newSessionId,
    createdAt: new Date(),
    lastAccessAt: new Date(),
    conversationHistory: []
  });
  
  return newSessionId;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // セッションIDの管理
    const sessionId = getOrCreateSession(body.sessionId);
    const session = sessionStore.get(sessionId)!;
    
    // n8nワークフローのWebhook URL（環境変数から取得）
    // n8n Cloud版のTEST URLを使用（Production URLはn8nのバグのため機能しない）
    // 現在のワークフローのWebhookパス: simple-test-20250714
    // Production URLのテストを実施
    const n8nWebhookUrl = 'https://clado.app.n8n.cloud/webhook/simple-test-20250714';
    
    // 会話履歴をセッションから取得（フロントエンドからの履歴と統合）
    const conversationHistory = body.conversationHistory || session.conversationHistory;
    
    // n8nワークフローに送信するデータ形式
    const n8nPayload = {
      query: body.query,
      timestamp: body.timestamp || new Date().toISOString(),
      sessionId: sessionId, // API側で管理されたセッションID
      conversationHistory: conversationHistory
    };

    // デバッグ情報をログ出力
    console.log('=== n8n Request Debug ===');
    console.log('n8n Webhook URL:', n8nWebhookUrl);
    console.log('n8n Payload:', JSON.stringify(n8nPayload, null, 2));
    console.log('Request Time:', new Date().toISOString());
    
    // n8nワークフローへのリクエスト
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(n8nPayload)
    });
    
    console.log('n8n Response Status:', response.status);
    console.log('n8n Response Headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('n8n Error Response:', errorText);
      
      // n8nのWebhook未登録エラー（404）の場合、分かりやすいメッセージを返す
      if (response.status === 404) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.message && errorData.message.includes('not registered')) {
            return NextResponse.json({
              success: false,
              error: 'n8nワークフローが無効です',
              explanation: 'n8n Cloud管理画面で「Execute workflow」ボタンをクリックしてからお試しください。Test Webhookは1回のリクエスト後に無効になります。',
              hint: errorData.hint || 'Execute workflowボタンをクリックしてください'
            }, { status: 503 });
          }
        } catch (parseError) {
          // JSONパースエラーの場合はそのまま続行
        }
      }
      
      throw new Error(`n8n webhook error: ${response.status} - ${errorText}`);
    }

    const responseText = await response.text();
    console.log('n8n Raw Response:', responseText);
    
    let data;
    try {
      // 空のレスポンスの場合はデフォルト値を設定
      if (!responseText || responseText.trim() === '') {
        console.warn('n8n returned empty response, using default values');
        data = {
          success: true,
          results: [],
          explanation: 'n8nワークフローは正常に接続されましたが、レスポンスが空でした。ワークフローの設定を確認してください。'
        };
      } else {
        data = JSON.parse(responseText);
      }
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      throw new Error(`n8n response is not valid JSON: ${responseText}`);
    }
    
    // セッションの会話履歴を更新
    if (data.conversationHistory) {
      session.conversationHistory = data.conversationHistory;
    }
    
    // レスポンスデータを整形
    const formattedResponse = {
      success: data.success || true,
      sessionId: sessionId, // 管理されたセッションIDを返す
　      original_query: data.webhook_query || data.original_query || body.query,
      english_query: data.english_query || '',
      generated_sql: data.claude_sql || data.generated_sql || '',
      results: data.redshift_results || data.results || [],
      explanation: data.explanation || 'データを分析しました。',
      confidence: data.confidence || 0.95,
      timestamp: data.execution_time || data.timestamp || new Date().toISOString(),
      conversationHistory: session.conversationHistory
    };

    return NextResponse.json(formattedResponse);
    
  } catch (error) {
    console.error('API Route Error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'データの処理中にエラーが発生しました。',
        explanation: 'すみません、現在サービスに接続できません。しばらく時間をおいて再度お試しください。'
      }, 
      { status: 500 }
    );
  }
} 