export type CodeLanguage = 'vex' | 'python' | 'bash' | 'hscript' | 'cpp';

export interface ConversionOptions {
  codeLanguage?: CodeLanguage;
}
