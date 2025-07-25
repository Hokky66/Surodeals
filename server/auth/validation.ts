import validator from 'validator';

/**
 * Valideer e-mailadres
 * @param email - Het e-mailadres om te valideren
 * @returns Object met validatie resultaat
 */
export function validateEmail(email: string): { isValid: boolean; error?: string } {
  if (!email) {
    return { isValid: false, error: 'E-mailadres is verplicht' };
  }

  if (!validator.isEmail(email)) {
    return { isValid: false, error: 'Ongeldig e-mailadres formaat' };
  }

  // Extra controles
  if (email.length > 254) {
    return { isValid: false, error: 'E-mailadres is te lang' };
  }

  const domain = email.split('@')[1];
  if (domain && domain.length > 253) {
    return { isValid: false, error: 'E-mailadres domein is te lang' };
  }

  return { isValid: true };
}

/**
 * Valideer naam (voor- en achternaam)
 * @param name - De naam om te valideren
 * @param fieldName - Naam van het veld voor foutmelding
 * @returns Object met validatie resultaat
 */
export function validateName(name: string, fieldName: string = 'Naam'): { isValid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { isValid: false, error: `${fieldName} is verplicht` };
  }

  if (name.trim().length < 2) {
    return { isValid: false, error: `${fieldName} moet minimaal 2 karakters lang zijn` };
  }

  if (name.trim().length > 50) {
    return { isValid: false, error: `${fieldName} mag maximaal 50 karakters lang zijn` };
  }

  // Alleen letters, spaties, apostrofes en hyphens
  if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(name.trim())) {
    return { isValid: false, error: `${fieldName} mag alleen letters, spaties, apostrofes en hyphens bevatten` };
  }

  return { isValid: true };
}

/**
 * Sanitize input door potentieel gevaarlijke karakters te verwijderen
 * @param input - De input om te sanitizen
 * @returns Schone input
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';
  
  // Verwijder HTML tags en escape speciale karakters
  let sanitized = validator.escape(input.trim());
  
  // Verwijder script tags (extra veiligheid)
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Verwijder javascript: protocollen
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  // Verwijder ongewenste HTML attributen
  sanitized = sanitized.replace(/on\w+="[^"]*"/gi, '');
  
  return sanitized;
}

/**
 * Valideer advertentie titel
 * @param title - De titel om te valideren
 * @returns Object met validatie resultaat
 */
export function validateAdTitle(title: string): { isValid: boolean; error?: string } {
  if (!title || title.trim().length === 0) {
    return { isValid: false, error: 'Titel is verplicht' };
  }

  if (title.trim().length < 3) {
    return { isValid: false, error: 'Titel moet minimaal 3 karakters lang zijn' };
  }

  if (title.trim().length > 100) {
    return { isValid: false, error: 'Titel mag maximaal 100 karakters lang zijn' };
  }

  // Controleer op verdachte scripts of HTML
  if (/<script|javascript:|on\w+=/i.test(title)) {
    return { isValid: false, error: 'Titel bevat niet toegestane karakters' };
  }

  return { isValid: true };
}

/**
 * Valideer advertentie beschrijving
 * @param description - De beschrijving om te valideren
 * @returns Object met validatie resultaat
 */
export function validateAdDescription(description: string): { isValid: boolean; error?: string } {
  if (!description || description.trim().length === 0) {
    return { isValid: false, error: 'Beschrijving is verplicht' };
  }

  if (description.trim().length < 10) {
    return { isValid: false, error: 'Beschrijving moet minimaal 10 karakters lang zijn' };
  }

  if (description.trim().length > 2000) {
    return { isValid: false, error: 'Beschrijving mag maximaal 2000 karakters lang zijn' };
  }

  // Controleer op verdachte scripts of HTML
  if (/<script|javascript:|on\w+=/i.test(description)) {
    return { isValid: false, error: 'Beschrijving bevat niet toegestane karakters' };
  }

  return { isValid: true };
}

/**
 * Valideer telefoonnummer
 * @param phone - Het telefoonnummer om te valideren
 * @returns Object met validatie resultaat
 */
export function validatePhone(phone: string): { isValid: boolean; error?: string } {
  if (!phone || phone.trim().length === 0) {
    return { isValid: false, error: 'Telefoonnummer is verplicht' };
  }

  // Alleen cijfers, spaties, hyphens en plus toegestaan
  if (!/^[\d\s+()-]+$/.test(phone)) {
    return { isValid: false, error: 'Telefoonnummer mag alleen cijfers, spaties, hyphens en + bevatten' };
  }

  if (phone.replace(/[\s+()-]/g, '').length < 6) {
    return { isValid: false, error: 'Telefoonnummer moet minimaal 6 cijfers bevatten' };
  }

  return { isValid: true };
}

/**
 * Valideer prijs
 * @param price - De prijs om te valideren (in centen)
 * @returns Object met validatie resultaat
 */
export function validatePrice(price: number): { isValid: boolean; error?: string } {
  if (price < 0) {
    return { isValid: false, error: 'Prijs kan niet negatief zijn' };
  }

  if (price > 100000000) { // Max 1 miljoen euro
    return { isValid: false, error: 'Prijs is te hoog' };
  }

  return { isValid: true };
}

/**
 * Valideer registratie data
 * @param data - Registratie data object
 * @returns Object met validatie resultaat
 */
export function validateRegistrationData(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Valideer e-mail
  const emailValidation = validateEmail(data.email);
  if (!emailValidation.isValid) {
    errors.push(emailValidation.error!);
  }

  // Valideer wachtwoord (wordt apart gevalideerd in password.ts)
  if (!data.password) {
    errors.push('Wachtwoord is verplicht');
  }

  // Valideer voornaam
  const firstNameValidation = validateName(data.firstName, 'Voornaam');
  if (!firstNameValidation.isValid) {
    errors.push(firstNameValidation.error!);
  }

  // Valideer achternaam
  const lastNameValidation = validateName(data.lastName, 'Achternaam');
  if (!lastNameValidation.isValid) {
    errors.push(lastNameValidation.error!);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Valideer login data
 * @param data - Login data object
 * @returns Object met validatie resultaat
 */
export function validateLoginData(data: {
  email: string;
  password: string;
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.email) {
    errors.push('E-mailadres is verplicht');
  }

  if (!data.password) {
    errors.push('Wachtwoord is verplicht');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}