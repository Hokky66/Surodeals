import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY niet gevonden. E-mail functionaliteit is uitgeschakeld.");
}

const mailService = new MailService();
if (process.env.SENDGRID_API_KEY) {
  mailService.setApiKey(process.env.SENDGRID_API_KEY);
}

interface ContactEmailParams {
  to: string;
  adTitle: string;
  senderName: string;
  senderEmail: string;
  senderPhone?: string;
  subject: string;
  message: string;
  adUrl: string;
}

interface NewAdNotificationParams {
  to: string;
  adTitle: string;
  adDescription: string;
  adLocation: string;
  adPrice: string;
  posterEmail: string;
  posterPhone?: string;
  adminUrl: string;
  adId: number;
}

interface EmailVerificationParams {
  to: string;
  userName: string;
  verificationUrl: string;
}

export async function sendContactEmail(params: ContactEmailParams): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log("E-mail zou verzonden worden naar:", params.to);
    console.log("Onderwerp:", params.subject);
    console.log("Van:", params.senderName, `(${params.senderEmail})`);
    return true; // Simulate success for development
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 30px 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 28px;">SuroDeals</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">Nieuwe reactie op je advertentie</p>
      </div>
      
      <div style="padding: 30px 20px; background: #f8f9fa;">
        <div style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #1f2937; margin-top: 0;">Je hebt een nieuwe reactie ontvangen!</h2>
          
          <div style="background: #eff6ff; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #2563eb;">
            <h3 style="margin: 0 0 5px 0; color: #1e40af;">Advertentie:</h3>
            <p style="margin: 0; font-weight: bold;">${params.adTitle}</p>
          </div>
          
          <div style="margin: 25px 0;">
            <h3 style="color: #374151; margin-bottom: 15px;">Contact informatie:</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280; width: 100px;"><strong>Naam:</strong></td>
                <td style="padding: 8px 0; color: #1f2937;">${params.senderName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;"><strong>E-mail:</strong></td>
                <td style="padding: 8px 0; color: #1f2937;">
                  <a href="mailto:${params.senderEmail}" style="color: #2563eb; text-decoration: none;">${params.senderEmail}</a>
                </td>
              </tr>
              ${params.senderPhone ? `
              <tr>
                <td style="padding: 8px 0; color: #6b7280;"><strong>Telefoon:</strong></td>
                <td style="padding: 8px 0; color: #1f2937;">
                  <a href="tel:${params.senderPhone}" style="color: #2563eb; text-decoration: none;">${params.senderPhone}</a>
                </td>
              </tr>
              ` : ''}
            </table>
          </div>
          
          <div style="margin: 25px 0;">
            <h3 style="color: #374151; margin-bottom: 10px;">Onderwerp:</h3>
            <p style="margin: 0; color: #1f2937; font-weight: 500;">${params.subject}</p>
          </div>
          
          <div style="margin: 25px 0;">
            <h3 style="color: #374151; margin-bottom: 10px;">Bericht:</h3>
            <div style="background: #f9fafb; padding: 15px; border-radius: 6px; border: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #1f2937; line-height: 1.6; white-space: pre-wrap;">${params.message}</p>
            </div>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${params.adUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Bekijk je advertentie
            </a>
          </div>
        </div>
      </div>
      
      <div style="background: #374151; color: #9ca3af; padding: 20px; text-align: center; font-size: 14px;">
        <p style="margin: 0;">Dit bericht is verzonden via SuroDeals</p>
        <p style="margin: 5px 0 0 0;">De grootste online marktplaats van Suriname</p>
      </div>
    </div>
  `;

  const textContent = `
Nieuwe reactie op je advertentie: ${params.adTitle}

Contact informatie:
Naam: ${params.senderName}
E-mail: ${params.senderEmail}
${params.senderPhone ? `Telefoon: ${params.senderPhone}` : ''}

Onderwerp: ${params.subject}

Bericht:
${params.message}

Bekijk je advertentie: ${params.adUrl}

---
Dit bericht is verzonden via SuroDeals
De grootste online marktplaats van Suriname
  `;

  try {
    await mailService.send({
      to: params.to,
      from: {
        email: 'info@surodeals.com',
        name: 'SuroDeals'
      },
      subject: `SuroDeals: ${params.subject}`,
      text: textContent,
      html: htmlContent,
    });
    return true;
  } catch (error) {
    console.error('Fout bij verzenden e-mail:', error);
    return false;
  }
}

export async function sendNewAdNotification(params: NewAdNotificationParams): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log("SENDGRID_API_KEY niet gevonden. E-mail functionaliteit is uitgeschakeld.");
    return false;
  }

  const msgData = {
    to: params.to,
    from: {
      email: 'info@surodeals.com',
      name: 'SuroDeals'
    },
    subject: `Nieuwe advertentie ter goedkeuring: ${params.adTitle}`,
    text: `
Hallo Admin,

Er is een nieuwe advertentie geplaatst die wacht op goedkeuring:

Titel: ${params.adTitle}
Locatie: ${params.adLocation}
Prijs: ${params.adPrice}

Beschrijving:
${params.adDescription}

Contact details adverteerder:
E-mail: ${params.posterEmail}
${params.posterPhone ? `Telefoon: ${params.posterPhone}` : ''}

Directe acties:
- Goedkeuren: ${params.adminUrl.replace('/admin', `/api/ads/${params.adId}/approve`)}
- Afwijzen: ${params.adminUrl.replace('/admin', `/api/ads/${params.adId}/reject`)}

Admin Dashboard: ${params.adminUrl}?tab=advertenties

Groeten,
Het SuriMarkt System
    `,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Nieuwe Advertentie ter Goedkeuring</h2>
        
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <h3 style="margin: 0 0 10px 0; color: #374151;">${params.adTitle}</h3>
          <p style="margin: 0; color: #6b7280;">Wacht op goedkeuring</p>
        </div>

        <div style="margin: 20px 0;">
          <h4 style="color: #374151;">Advertentie Details:</h4>
          <p><strong>Locatie:</strong> ${params.adLocation}</p>
          <p><strong>Prijs:</strong> ${params.adPrice}</p>
        </div>

        <div style="margin: 20px 0;">
          <h4 style="color: #374151;">Beschrijving:</h4>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px;">
            <p style="margin: 0; white-space: pre-line;">${params.adDescription}</p>
          </div>
        </div>

        <div style="margin: 20px 0;">
          <h4 style="color: #374151;">Contact Adverteerder:</h4>
          <p><strong>E-mail:</strong> <a href="mailto:${params.posterEmail}">${params.posterEmail}</a></p>
          ${params.posterPhone ? `<p><strong>Telefoon:</strong> ${params.posterPhone}</p>` : ''}
        </div>

        <div style="margin: 30px 0; text-align: center;">
          <a href="${params.adminUrl.replace('/admin', `/api/ads/${params.adId}/approve`)}" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-right: 10px;">
            ✓ Goedkeuren
          </a>
          <a href="${params.adminUrl.replace('/admin', `/api/ads/${params.adId}/reject`)}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            ✗ Afwijzen
          </a>
        </div>
        
        <div style="margin: 20px 0; text-align: center;">
          <a href="${params.adminUrl}?tab=advertenties" style="background-color: #6b7280; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block; font-size: 14px;">
            Ga naar Admin Dashboard
          </a>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
          <p>Log in op het admin dashboard om deze advertentie goed te keuren of af te wijzen.</p>
          <p>Het SuriMarkt System</p>
        </div>
      </div>
    `,
  };

  try {
    await mailService.send(msgData);
    console.log('Admin notificatie e-mail verzonden naar:', params.to);
    return true;
  } catch (error) {
    console.error('Fout bij verzenden admin notificatie:', error);
    return false;
  }
}

export async function sendEmailVerification(params: EmailVerificationParams): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log("SENDGRID_API_KEY niet gevonden. E-mailverificatie wordt gesimuleerd.");
    console.log("Verificatie e-mail zou verzonden worden naar:", params.to);
    console.log("Verificatie URL:", params.verificationUrl);
    return true; // Simulate success for development
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 30px 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 28px;">SuroDeals</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">Welkom bij de grootste marktplaats van Suriname</p>
      </div>
      
      <div style="padding: 30px 20px; background: #f8f9fa;">
        <div style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #374151; margin: 0 0 20px 0;">Welkom ${params.userName}!</h2>
          
          <p style="color: #6b7280; line-height: 1.6; margin: 0 0 20px 0;">
            Bedankt voor je registratie bij SuroDeals. Om je account te activeren, klik op de onderstaande knop:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${params.verificationUrl}" 
               style="display: inline-block; background: #2563eb; color: white; padding: 15px 30px; 
                      text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
              Verifieer E-mailadres
            </a>
          </div>
          
          <p style="color: #6b7280; line-height: 1.6; margin: 20px 0 0 0; font-size: 14px;">
            Als de knop niet werkt, kopieer en plak deze link in je browser:<br>
            <a href="${params.verificationUrl}" style="color: #2563eb; word-break: break-all;">
              ${params.verificationUrl}
            </a>
          </p>
          
          <div style="background: #eff6ff; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #2563eb;">
            <p style="margin: 0; color: #1e40af; font-size: 14px;">
              <strong>Waarom verifiëren?</strong><br>
              E-mailverificatie zorgt voor de veiligheid van je account en helpt ons spam te voorkomen.
            </p>
          </div>
        </div>
      </div>
      
      <div style="background: #374151; color: #9ca3af; padding: 20px; text-align: center; font-size: 14px;">
        <p style="margin: 0;">Deze link verloopt na 24 uur</p>
        <p style="margin: 5px 0 0 0;">© 2025 SuroDeals - De grootste online marktplaats van Suriname</p>
      </div>
    </div>
  `;

  const textContent = `
Welkom bij SuroDeals, ${params.userName}!

Bedankt voor je registratie. Om je account te activeren, ga naar:
${params.verificationUrl}

Deze link verloopt na 24 uur.

Als je problemen ondervindt, neem contact met ons op.

Groeten,
Het SuroDeals Team
De grootste online marktplaats van Suriname
  `;

  try {
    await mailService.send({
      to: params.to,
      from: {
        email: 'info@surodeals.com',
        name: 'SuroDeals'
      },
      subject: 'Verifieer je e-mailadres - SuroDeals',
      text: textContent,
      html: htmlContent,
    });
    console.log('E-mailverificatie verzonden naar:', params.to);
    return true;
  } catch (error) {
    console.error('Fout bij verzenden verificatie e-mail:', error);
    return false;
  }
}