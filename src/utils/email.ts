import { Resend } from 'resend';
import { config } from '../config';
import { createChildLogger } from './logger';

const log = createChildLogger('email');

let resendClient: Resend | null = null;

const getResend = (): Resend => {
  if (!resendClient) {
    resendClient = new Resend(config.resend.apiKey);
  }
  return resendClient;
};

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async ({ to, subject, html }: SendEmailOptions): Promise<boolean> => {
  if (!config.resend.apiKey) {
    log.warn('Resend API key not configured — skipping email', { to, subject });
    return false;
  }

  try {
    const { error } = await getResend().emails.send({
      from: config.resend.fromEmail,
      to,
      subject,
      html,
    });

    if (error) {
      log.error('Failed to send email', { error, to, subject });
      return false;
    }

    log.info('Email sent', { to, subject });
    return true;
  } catch (err) {
    log.error('Email send exception', { err, to, subject });
    return false;
  }
};
