import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY niet gevonden. E-mail functionaliteit is beperkt.");
}

const mailService = new MailService();
if (process.env.SENDGRID_API_KEY) {
  mailService.setApiKey(process.env.SENDGRID_API_KEY);
}



/**
 * Stuur verificatie e-mail
 * @param email - Ontvanger e-mailadres
 * @param token - Verificatie token
 * @param baseUrl - Base URL van de applicatie
 */
// Test functie voor e-mail debugging
export async function sendTestEmail(email: string): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('SendGrid API key niet beschikbaar');
    return false;
  }

  console.log(`🧪 UITGEBREIDE DELIVERABILITY TEST voor ${email}`);

  // Detecteer e-mailprovider
  const emailDomain = email.split('@')[1]?.toLowerCase();
  let providerInfo = 'Onbekend';

  if (emailDomain?.includes('gmail')) providerInfo = 'Gmail (Google)';
  else if (emailDomain?.includes('live.nl') || emailDomain?.includes('hotmail')) providerInfo = 'Live.nl/Hotmail (Microsoft)';
  else if (emailDomain?.includes('yahoo')) providerInfo = 'Yahoo';
  else if (emailDomain?.includes('outlook')) providerInfo = 'Outlook (Microsoft)';

  console.log(`📧 E-mailprovider: ${providerInfo} (${emailDomain})`);

  const testEmail = {
    to: email,
    from: 'noreply@surodeals.com',
    subject: 'SuroDeals Deliverability Test - Felloranje CTA',
    text: 'Dit is een uitgebreide deliverability test van SuroDeals om de e-mail functionaliteit te controleren.',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1e40af;">SuroDeals Deliverability Test</h2>
        <p>Deze test controleert:</p>
        <ul>
          <li>✅ SendGrid API configuratie</li>
          <li>✅ E-mail template rendering</li>
          <li>✅ Provider deliverability (${providerInfo})</li>
          <li>✅ Spam filter bypass</li>
        </ul>
        <div style="background: #ff4500 !important; color: white; padding: 15px 30px; text-align: center; border-radius: 8px; margin: 20px 0; box-shadow: 0 4px 6px rgba(255, 69, 0, 0.25);">
          <strong>FELLORANJE CTA TEST (#ff4500)</strong>
        </div>
        <p><strong>Als je deze e-mail ontvangt, werkt alles correct!</strong></p>
        <hr>
        <small>Timestamp: ${new Date().toISOString()}</small>
      </div>
    `,
    headers: {
      'X-Priority': '1',
      'X-MSMail-Priority': 'High',
      'X-Mailer': 'SuroDeals Test v1.0',
    },
    categories: ['deliverability-test'],
    customArgs: {
      test_type: 'deliverability',
      provider: providerInfo,
      timestamp: new Date().toISOString()
    }
  };

  try {
    const result = await mailService.send(testEmail);
    console.log(`✅ Test e-mail verzonden naar ${email}`);
    console.log(`📊 Status: ${result[0]?.statusCode}`);
    console.log(`📋 Message ID: ${result[0]?.headers?.['x-message-id']}`);
    console.log(`🎯 Provider: ${providerInfo}`);
    console.log(`⏰ Verwachte aankomsttijd: 1-5 minuten`);
    console.log(`🔥 CTA Kleur: Felloranje (#ff4500) met shadow effect`);
    return true;
  } catch (error) {
    console.error('❌ Test e-mail fout:', error);
    return false;
  }
}

export async function sendVerificationEmail(
  email: string, 
  token: string, 
  baseUrl: string
): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('SendGrid API key niet beschikbaar, e-mail wordt niet verzonden');
    return;
  }

  const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

  const emailContent = {
    to: email,
    from: {
      email: 'noreply@surodeals.com',
      name: 'SuroDeals'
    },
    subject: 'Welkom bij SuroDeals - Verifieer je account',
    text: `
Welkom bij SuroDeals!

Bedankt voor je registratie bij Suriname's grootste online marktplaats.

Klik op deze link om je e-mailadres te verifiëren:
${verificationUrl}

Deze link is 24 uur geldig.

Als je geen account hebt aangemaakt bij SuroDeals, kun je deze e-mail negeren.

Met vriendelijke groet,
Het SuroDeals Team

SuroDeals - Alles op een plek
Paramaribo, Suriname
    `,
    html: `
      <!DOCTYPE html>
      <html lang="nl">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welkom bij SuroDeals</title>
        <style>
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
          .header { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 30px 20px; text-align: center; }
          .content { padding: 40px 30px; background: #ffffff; }
          .button-container { text-align: center; margin: 30px 0; }
          .verify-button { 
            display: inline-block; 
            background: #ff4500 !important; 
            color: #ffffff !important; 
            padding: 15px 30px; 
            text-decoration: none; 
            border-radius: 8px; 
            font-weight: bold;
            font-size: 16px;
            border: none;
            box-shadow: 0 4px 6px rgba(255, 69, 0, 0.25);
          }
          .link-backup { 
            background: #f8fafc; 
            padding: 15px; 
            border-radius: 6px; 
            margin: 20px 0; 
            word-break: break-all; 
            border-left: 4px solid #2563eb;
            font-family: monospace;
            font-size: 14px;
          }
          .footer { background: #f8fafc; padding: 30px 20px; text-align: center; color: #64748b; border-top: 1px solid #e2e8f0; }
          .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin: 20px 0; }
          .company-info { margin-top: 20px; font-size: 14px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold;">SuroDeals</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Suriname's grootste online marktplaats</p>
          </div>

          <div class="content">
            <h2 style="color: #1e293b; margin-top: 0;">Welkom bij SuroDeals!</h2>

            <p>Bedankt voor je registratie bij SuroDeals. Om je account te activeren en veilig te houden, moeten we je e-mailadres verifiëren.</p>

            <div class="button-container">
              <a href="${verificationUrl}" class="verify-button">✓ Verifieer E-mailadres</a>
            </div>

            <p>Werkt de knop niet? Kopieer en plak dan deze link in je browser:</p>
            <div class="link-backup">${verificationUrl}</div>

            <div class="warning">
              <strong>⚠️ Belangrijk:</strong> Deze verificatielink is slechts 24 uur geldig. Verifieer je account zo snel mogelijk.
            </div>

            <p>Na verificatie kun je:</p>
            <ul>
              <li>Advertenties plaatsen en beheren</li>
              <li>Contact opnemen met andere gebruikers</li>
              <li>Je profiel aanpassen</li>
              <li>Favorieten opslaan</li>
            </ul>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;">

            <p style="font-size: 14px; color: #64748b;">
              Heb je geen account aangemaakt bij SuroDeals? Dan kun je deze e-mail veilig negeren. Er worden geen verdere e-mails verzonden.
            </p>
          </div>

          <div class="footer">
            <p style="margin: 0; font-weight: bold;">© 2025 SuroDeals</p>
            <div class="company-info">
              <p style="margin: 5px 0;">Alles op een plek</p>
              <p style="margin: 5px 0;">Paramaribo, Suriname</p>
              <p style="margin: 5px 0;">info@surodeals.com</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    // Professionele e-mail configuratie met priority headers
    const emailWithHeaders = {
      ...emailContent,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'X-Mailer': 'SuroDeals v1.0',
        'List-Unsubscribe': '<mailto:unsubscribe@surodeals.com>',
      },
      categories: ['email-verification', 'account-activation'],
      customArgs: {
        environment: process.env.NODE_ENV || 'development',
        email_type: 'verification'
      }
    };

    const result = await mailService.send(emailWithHeaders);
    console.log(`✅ Verificatie e-mail succesvol verzonden naar ${email}`);
    console.log(`📧 E-mail verzonden van: SuroDeals <noreply@surodeals.com>`);
    console.log(`📮 SendGrid Response:`, result[0]?.statusCode, result[0]?.headers?.['x-message-id']);

    // Log belangrijke deliverability info
    if (result[0]?.headers) {
      console.log(`📊 Message ID: ${result[0].headers['x-message-id']}`);
      console.log(`🎯 Delivery Status: Accepted by SendGrid`);
      console.log(`📬 Deliverability Info:`);
      console.log(`   - From: noreply@surodeals.com (SuroDeals)`);
      console.log(`   - To: ${email}`);
      console.log(`   - Subject: Welkom bij SuroDeals - Verifieer je account`);
      console.log(`   - Categories: email-verification, account-activation`);
      console.log(`   - Priority Headers: X-Priority=1, X-MSMail-Priority=High`);
      console.log(`   - CTA Color: Bright Orange (#ff4500)`);
    }

    // Monitoring melding voor deliverability tracking
    console.log(`🔍 DELIVERABILITY MONITORING:`);
    console.log(`   - E-mail is succesvol verzonden via SendGrid`);
    console.log(`   - Headers bevatten priority markering voor betere zichtbaarheid`);
    console.log(`   - CTA-knop is nu felloranje (#ff4500) voor betere zichtbaarheid`);
    console.log(`   - Als e-mail niet aankomt binnen 5 minuten, controleer spam/ongewenste mail`)

  } catch (error) {
    console.error('❌ KRITIEKE FOUT bij verzenden verificatie e-mail:', error);

    // Log uitgebreide details over de SendGrid fout
    if (error && typeof error === 'object' && 'response' in error) {
      const sgError = error as any;
      console.error('🔥 SendGrid API Error Details:', {
        statusCode: sgError.code,
        message: sgError.message,
        response: sgError.response?.body,
        headers: sgError.response?.headers
      });

      // Specifieke SendGrid foutmeldingen
      if (sgError.response?.body?.errors) {
        console.error('📋 SendGrid Errors:', sgError.response.body.errors);
      }
    }

    throw new Error(`SendGrid fout: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
  }
}

/**
 * Stuur 2FA verificatiecode
 * @param email - Ontvanger e-mailadres
 * @param code - 6-cijferige verificatiecode
 */
export async function send2FACode(email: string, code: string): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('SendGrid API key niet beschikbaar, e-mail wordt niet verzonden');
    return;
  }

  const emailContent = {
    to: email,
    from: {
      email: 'info@surodeals.com',
      name: 'SuroDeals'
    },
    subject: 'Je inlogcode - SuroDeals',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
          .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
          .content { padding: 30px; text-align: center; }
          .code { 
            font-size: 32px; 
            font-weight: bold; 
            color: #007bff; 
            background-color: #f8f9fa; 
            padding: 20px; 
            border-radius: 8px; 
            letter-spacing: 5px;
            margin: 20px 0;
          }
          .footer { background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: #007bff; margin: 0;">SuroDeals</h1>
          </div>

          <div class="content">
            <h2>Je inlogcode</h2>
            <p>Gebruik deze code om in te loggen op SuroDeals:</p>

            <div class="code">${code}</div>

            <p>Deze code verloopt over 10 minuten.</p>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">

            <p style="font-size: 14px; color: #666;">
              Als je deze code niet hebt aangevraagd, wijzig dan onmiddellijk je wachtwoord.
            </p>
          </div>

          <div class="footer">
            <p>© 2025 SuroDeals</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await mailService.send(emailContent);
    console.log(`2FA code verzonden naar ${email}`);
  } catch (error) {
    console.error('Fout bij verzenden 2FA code:', error);
    throw new Error('Kon 2FA code niet verzenden');
  }
}

/**
 * Stuur wachtwoord reset e-mail
 * @param email - Ontvanger e-mailadres
 * @param token - Reset token
 * @param baseUrl - Base URL van de applicatie
 * @param firstName - Voornaam van de gebruiker
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  baseUrl: string,
  firstName?: string
): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('SendGrid API key niet beschikbaar, password reset e-mail wordt niet verzonden');
    return;
  }

  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  const emailContent = {
    to: email,
    from: {
      email: 'noreply@surodeals.com',
      name: 'SuroDeals'
    },
    subject: 'Wachtwoord resetten - SuroDeals',
    text: `
Hallo ${firstName || ''},

Je hebt een wachtwoord reset aangevraagd voor je SuroDeals account.

Klik op deze link om een nieuw wachtwoord in te stellen:
${resetUrl}

Deze link is 1 uur geldig.

Als je geen wachtwoord reset hebt aangevraagd, kun je deze e-mail negeren.

Met vriendelijke groet,
Het SuroDeals Team

SuroDeals - Alles op een plek
Paramaribo, Suriname
    `,
    html: `
      <!DOCTYPE html>
      <html lang="nl">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Wachtwoord resetten - SuroDeals</title>
        <style>
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
          .header { background: linear-gradient(135deg, #dc2626, #b91c1c); color: white; padding: 30px 20px; text-align: center; }
          .content { padding: 40px 30px; background: #ffffff; }
          .button-container { text-align: center; margin: 30px 0; }
          .reset-button { 
            display: inline-block; 
            background: #ff4500 !important; 
            color: #ffffff !important; 
            padding: 15px 30px; 
            text-decoration: none; 
            border-radius: 8px; 
            font-weight: bold;
            font-size: 16px;
            border: none;
            box-shadow: 0 4px 6px rgba(255, 69, 0, 0.25);
          }
          .link-backup { 
            background: #f8fafc; 
            padding: 15px; 
            border-radius: 6px; 
            margin: 20px 0; 
            word-break: break-all; 
            border-left: 4px solid #dc2626;
            font-family: monospace;
            font-size: 14px;
          }
          .footer { background: #f8fafc; padding: 30px 20px; text-align: center; color: #64748b; border-top: 1px solid #e2e8f0; }
          .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin: 20px 0; }
          .security-notice { background: #fee2e2; border: 1px solid #dc2626; padding: 15px; border-radius: 6px; margin: 20px 0; }
          .company-info { margin-top: 20px; font-size: 14px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold;">🔒 SuroDeals</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Wachtwoord Reset</p>
          </div>

          <div class="content">
            <h2 style="color: #1e293b; margin-top: 0;">Hallo ${firstName || ''},</h2>

            <p>Je hebt een wachtwoord reset aangevraagd voor je SuroDeals account (${email}).</p>

            <div class="button-container">
              <a href="${resetUrl}" class="reset-button">🔑 Nieuw Wachtwoord Instellen</a>
            </div>

            <p>Werkt de knop niet? Kopieer en plak dan deze link in je browser:</p>
            <div class="link-backup">${resetUrl}</div>

            <div class="warning">
              <strong>⚠️ Belangrijk:</strong> Deze reset link is slechts 1 uur geldig. Stel je nieuwe wachtwoord zo snel mogelijk in.
            </div>

            <div class="security-notice">
              <strong>🔐 Beveiligingsmelding:</strong> Als je geen wachtwoord reset hebt aangevraagd, kun je deze e-mail veilig negeren. Je huidige wachtwoord blijft dan ongewijzigd.
            </div>

            <p>Voor je veiligheid raden we aan om:</p>
            <ul>
              <li>Een sterk, uniek wachtwoord te kiezen</li>
              <li>Minimaal 8 karakters te gebruiken</li>
              <li>Een mix van letters, cijfers en symbolen</li>
              <li>Geen persoonlijke informatie te gebruiken</li>
            </ul>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;">

            <p style="font-size: 14px; color: #64748b;">
              Heb je problemen? Contacteer ons via info@surodeals.com
            </p>
          </div>

          <div class="footer">
            <p style="margin: 0; font-weight: bold;">© 2025 SuroDeals</p>
            <div class="company-info">
              <p style="margin: 5px 0;">Alles op een plek</p>
              <p style="margin: 5px 0;">Paramaribo, Suriname</p>
              <p style="margin: 5px 0;">info@surodeals.com</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    headers: {
      'X-Priority': '1',
      'X-MSMail-Priority': 'High',
      'X-Mailer': 'SuroDeals v1.0',
    },
    categories: ['password-reset', 'security'],
    customArgs: {
      environment: process.env.NODE_ENV || 'development',
      email_type: 'password_reset'
    }
  };

  try {
    const result = await mailService.send(emailContent);
    console.log(`✅ Password reset e-mail succesvol verzonden naar ${email}`);
    console.log(`📧 E-mail verzonden van: SuroDeals <noreply@surodeals.com>`);
    console.log(`📮 SendGrid Response:`, result[0]?.statusCode, result[0]?.headers?.['x-message-id']);
    
    if (result[0]?.headers) {
      console.log(`📊 Message ID: ${result[0].headers['x-message-id']}`);
      console.log(`🎯 Delivery Status: Accepted by SendGrid`);
      console.log(`🔑 Reset URL: ${resetUrl}`);
    }

  } catch (error) {
    console.error('❌ KRITIEKE FOUT bij verzenden password reset e-mail:', error);
    throw new Error(`SendGrid fout: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
  }
}