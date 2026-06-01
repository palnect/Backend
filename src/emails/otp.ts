export const otpEmailTemplate = (name: string, otp: string, expiresInMinutes = 10) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Your Palnect Password</title>
</head>
<body style="margin:0;padding:0;background:#0d0d14;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d14;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#13131f;border-radius:20px;overflow:hidden;border:1px solid rgba(139,92,246,0.2);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a0a2e 0%,#130d24 100%);padding:40px 48px 28px;text-align:center;border-bottom:1px solid rgba(139,92,246,0.15);">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Palnect</h1>
              <p style="margin:8px 0 0;font-size:13px;color:#8b5cf6;letter-spacing:1.5px;text-transform:uppercase;">Password Reset</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 48px;">
              <p style="margin:0 0 6px;font-size:13px;color:#6b6b8a;text-transform:uppercase;letter-spacing:1.5px;">Hi ${name},</p>
              <h2 style="margin:0 0 20px;font-size:20px;font-weight:600;color:#f0f0f8;">Here's your OTP code</h2>
              <p style="margin:0 0 32px;font-size:14px;color:#8888aa;line-height:1.7;">Use this code to reset your password. It expires in <strong style="color:#ffffff;">${expiresInMinutes} minutes</strong>.</p>
              <!-- OTP Box -->
              <div style="background:rgba(139,92,246,0.1);border:2px solid rgba(139,92,246,0.4);border-radius:16px;padding:32px;text-align:center;margin-bottom:32px;">
                <p style="margin:0 0 8px;font-size:12px;color:#8888aa;text-transform:uppercase;letter-spacing:2px;">One-Time Password</p>
                <div style="font-size:42px;font-weight:700;color:#ffffff;letter-spacing:12px;font-family:monospace;">${otp}</div>
              </div>
              <p style="margin:0;font-size:13px;color:#6b6b8a;line-height:1.7;">If you didn't request a password reset, you can safely ignore this email. Your account remains secure.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 48px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
              <p style="margin:0;font-size:12px;color:#44445a;">© 2026 Palnect. This OTP expires in ${expiresInMinutes} minutes.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
