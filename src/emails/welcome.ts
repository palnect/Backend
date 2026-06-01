export const welcomeEmailTemplate = (name: string, welcomeMessage: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Palnect</title>
</head>
<body style="margin:0;padding:0;background:#0d0d14;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d14;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#13131f;border-radius:20px;overflow:hidden;border:1px solid rgba(139,92,246,0.2);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a0a2e 0%,#130d24 100%);padding:48px 48px 32px;text-align:center;border-bottom:1px solid rgba(139,92,246,0.15);">
              <div style="display:inline-flex;align-items:center;gap:12px;margin-bottom:16px;">
                <div style="width:48px;height:48px;background:rgba(139,92,246,0.2);border-radius:14px;border:1px solid rgba(139,92,246,0.4);display:flex;align-items:center;justify-content:center;font-size:24px;text-align:center;line-height:48px;">✦</div>
              </div>
              <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Palnect</h1>
              <p style="margin:8px 0 0;font-size:13px;color:#8b5cf6;letter-spacing:2px;text-transform:uppercase;font-weight:500;">Your AI Tutor is Ready</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 48px;">
              <p style="margin:0 0 8px;font-size:14px;color:#6b6b8a;text-transform:uppercase;letter-spacing:1.5px;font-weight:500;">Hello, ${name} 👋</p>
              <h2 style="margin:0 0 24px;font-size:22px;font-weight:600;color:#f0f0f8;line-height:1.3;">Welcome to the future of learning</h2>
              <div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:14px;padding:24px;margin-bottom:32px;">
                <p style="margin:0;font-size:15px;color:#c4c4d4;line-height:1.7;">${welcomeMessage}</p>
              </div>
              <p style="margin:0 0 16px;font-size:15px;color:#8888aa;line-height:1.7;">Palnect uses realtime voice AI to tutor you conversationally — not through boring videos or flashcards. Your AI tutor <strong style="color:#ffffff;">Lexi</strong> is ready for your first session.</p>
              <div style="margin:32px 0;text-align:center;">
                <a href="${process.env.FRONTEND_URL ?? 'http://localhost:3001'}/onboarding" style="display:inline-block;background:#8b5cf6;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 40px;border-radius:100px;letter-spacing:0.3px;">Start Learning with Lexi →</a>
              </div>
              <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:32px 0;" />
              <div style="display:flex;gap:24px;">
                <div style="flex:1;">
                  <div style="font-size:22px;margin-bottom:8px;">🎯</div>
                  <h4 style="margin:0 0 4px;font-size:13px;font-weight:600;color:#f0f0f8;">Personalized</h4>
                  <p style="margin:0;font-size:12px;color:#6b6b8a;line-height:1.5;">Adapts to your pace and learning style in realtime</p>
                </div>
                <div style="flex:1;">
                  <div style="font-size:22px;margin-bottom:8px;">🔊</div>
                  <h4 style="margin:0 0 4px;font-size:13px;font-weight:600;color:#f0f0f8;">Voice-First</h4>
                  <p style="margin:0;font-size:12px;color:#6b6b8a;line-height:1.5;">Conversational AI tutor, not a chatbot</p>
                </div>
                <div style="flex:1;">
                  <div style="font-size:22px;margin-bottom:8px;">⚡</div>
                  <h4 style="margin:0 0 4px;font-size:13px;font-weight:600;color:#f0f0f8;">Low Latency</h4>
                  <p style="margin:0;font-size:12px;color:#6b6b8a;line-height:1.5;">Responses in under 600ms — feels like a real tutor</p>
                </div>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 48px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
              <p style="margin:0;font-size:12px;color:#44445a;">© 2026 Palnect. All rights reserved.</p>
              <p style="margin:8px 0 0;font-size:12px;color:#44445a;">You're receiving this because you just created a Palnect account.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
