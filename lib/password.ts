/**
 * Najkratšie heslo, ktoré appka prijme. Rovnaké minimum má aj Supabase Auth,
 * takže kratšie by nepustil ani on. Klub ho zvolil kvôli pohodliu — appku
 * používa jediný človek; odhadovanie hesla brzdí obmedzenie pokusov v Supabase.
 */
export const MIN_PASSWORD = 6;
