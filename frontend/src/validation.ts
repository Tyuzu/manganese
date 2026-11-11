export interface ValidationResult {
  isValid: boolean;
  message: string | null;
}

export function validateUsername(username: string): ValidationResult {
  if (!username) {
    return { isValid: false, message: 'Username is required.' };
  }
  if (username.length < 3) {
    return { isValid: false, message: 'Username must be at least 3 characters long.' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { isValid: false, message: 'Only letters, numbers, and underscores are allowed.' };
  }
  return { isValid: true, message: null };
}

export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { isValid: false, message: 'Password is required.' };
  }
  if (password.length < 6) {
    return { isValid: false, message: 'Password must be at least 6 characters long.' };
  }
  return { isValid: true, message: null };
}