import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY environment variable must be set");
}

const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY);

export async function sendSimpleVerificationEmail(
  email: string,
  token: string,
  baseUrl: string
): Promise<void> {
  console.log(`Eenvoudige verificatie e-mail verzenden naar: ${email}`);

  const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

  const emailData = {
    to: email,
    from: 'info@surodeals.com',
    subject: 'Verifieer je SuroDeals account',
    text: `Hallo,

Klik op deze link om je account te verifiëren:
${verificationUrl}

Deze link is 24 uur geldig.

SuroDeals Team`,
    html: `
<html>
<body style="font-family: Arial, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; padding: 20px;">
    <h2>SuroDeals</h2>
    <p>Hallo,</p>
    <p>Klik op de knop hieronder om je account te verifiëren:</p>
    <p>
      <a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
        Verifieer Account
      </a>
    </p>
    <p>Of kopieer deze link in je browser:<br>
    ${verificationUrl}</p>
    <p><small>Deze link is 24 uur geldig.</small></p>
    <hr>
    <p><small>SuroDeals Team</small></p>
  </div>
</body>
</html>
    `
  };

  try {
    const result = await mailService.send(emailData);
    console.log(`✅ E-mail verzonden naar ${email}`);
    console.log(`Status: ${result[0]?.statusCode}`);
    
    if (result[0]?.headers?.['x-message-id']) {
      console.log(`Message ID: ${result[0].headers['x-message-id']}`);
    }
    
  } catch (error) {
    console.error('E-mail fout:', error);
    throw new Error('Kon verificatie e-mail niet verzenden');
  }
}