import { toast } from '../store/toast';

/** Convenience hook mirroring the toast singleton (stable identity). */
export function useToast() {
  return toast;
}
