import { useState } from 'react';
import { Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { CalendarClock, CircleCheck, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCaptchaChallenge } from '@/hooks/use-captcha';
import { useToast } from '@/hooks/use-toast';
import { OPERATOR } from '@/lib/platform-legal';
import { apiRequest } from '@/lib/queryClient';
import { CONTACT_SUBJECTS, contactMessageSchema, type ContactSubjectId } from '@shared/contact';

/**
 * Formulario de contacto del sitio público.
 *
 * Reglas de la casa:
 *   * la validación es la MISMA que aplica el servidor (`contactMessageSchema`),
 *     sin una segunda copia de los límites ni de los mensajes;
 *   * el CAPTCHA se resuelve mientras la persona escribe (`useCaptchaChallenge`),
 *     así que quien envía no ve ni resuelve ningún acertijo;
 *   * el honeypot viaja aparte del estado del formulario: si un bot lo rellena,
 *     el servidor responde "ok" y no envía nada.
 */

interface ContactFormValues {
  name: string;
  email: string;
  phone: string;
  subject: ContactSubjectId;
  message: string;
  consent: boolean;
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="mt-1 text-xs text-[#c02b0a]">
      {message}
    </p>
  );
}

export default function ContactForm() {
  const { toast } = useToast();
  const captcha = useCaptchaChallenge();
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<ContactFormValues>({
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      subject: 'consulta',
      message: '',
      consent: false,
    },
  });

  const consent = watch('consent');
  const subject = watch('subject');
  const email = watch('email');

  const onSubmit = handleSubmit(async (values) => {
    const parsed = contactMessageSchema.safeParse({ ...values, website: honeypot });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && field !== 'website') {
          setError(field as keyof ContactFormValues, { message: issue.message });
        }
      }
      return;
    }

    setSubmitting(true);
    try {
      const { token, solution } = await captcha.ensureSolved();
      await apiRequest('POST', '/api/contact', {
        ...parsed.data,
        captchaToken: token,
        captchaAnswer: solution,
      });
      setSent(true);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      toast({
        title: 'No se pudo enviar el mensaje',
        description:
          !detail || /^\d{3}:/.test(detail)
            ? `Escríbanos directamente a ${OPERATOR.email} y lo atendemos igual.`
            : detail,
        variant: 'destructive',
      });
      captcha.refresh();
    } finally {
      setSubmitting(false);
    }
  });

  if (sent) {
    return (
      <div
        className="mt-2 rounded-[3px] border border-[#1e6b4a]/30 bg-[#1e6b4a]/5 p-6 text-center"
        data-testid="contact-success"
        role="status"
      >
        <CircleCheck className="mx-auto h-8 w-8 text-[#1e6b4a]" aria-hidden="true" />
        <p className="mt-3 font-display text-lg font-semibold text-[#1b1611]">Mensaje enviado</p>
        <p className="mt-1 text-sm text-[#3f382f]">
          Gracias por escribirnos. Le responderemos a {email || 'su correo'} en días hábiles.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 border-[#1b1611]/20"
          onClick={() => setSent(false)}
        >
          Enviar otro mensaje
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-4" data-testid="contact-form" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="contact-name">Nombre</Label>
          <Input
            id="contact-name"
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            data-testid="input-contact-name"
            {...register('name')}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <Label htmlFor="contact-email">Correo</Label>
          <Input
            id="contact-email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            data-testid="input-contact-email"
            {...register('email')}
          />
          <FieldError message={errors.email?.message} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="contact-phone">
            Teléfono <span className="font-normal text-[#5c5246]">(opcional)</span>
          </Label>
          <Input
            id="contact-phone"
            type="tel"
            autoComplete="tel"
            aria-invalid={Boolean(errors.phone)}
            data-testid="input-contact-phone"
            {...register('phone')}
          />
          <FieldError message={errors.phone?.message} />
        </div>
        <div>
          <Label htmlFor="contact-subject">Motivo</Label>
          <Select
            value={subject}
            onValueChange={(value) => setValue('subject', value as ContactSubjectId)}
          >
            <SelectTrigger id="contact-subject" data-testid="select-contact-subject">
              <SelectValue placeholder="Elija un motivo" />
            </SelectTrigger>
            <SelectContent>
              {CONTACT_SUBJECTS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.subject?.message} />
        </div>
      </div>

      <div>
        <Label htmlFor="contact-message">Mensaje</Label>
        <Textarea
          id="contact-message"
          rows={5}
          aria-invalid={Boolean(errors.message)}
          data-testid="input-contact-message"
          {...register('message')}
        />
        <FieldError message={errors.message?.message} />
      </div>

      {/* Honeypot: invisible para personas; un bot que lo rellena no envía nada. */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="contact-website">No complete este campo</label>
        <input
          id="contact-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
        />
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id="contact-consent"
          checked={consent}
          onCheckedChange={(checked) =>
            setValue('consent', checked === true, { shouldValidate: true })
          }
          data-testid="checkbox-contact-consent"
        />
        <div>
          <Label htmlFor="contact-consent" className="text-sm font-normal leading-relaxed">
            Acepto el tratamiento de mis datos para responder este mensaje, conforme a la{' '}
            <Link href="/privacidad" className="text-[#c02b0a] underline underline-offset-2">
              política de privacidad
            </Link>
            .
          </Label>
          <FieldError message={errors.consent?.message} />
        </div>
      </div>

      {captcha.error && (
        <p role="alert" className="text-xs text-[#c02b0a]">
          {captcha.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={submitting}
          data-testid="button-send-contact"
          className="bg-[#c02b0a] text-white hover:bg-[#9c2107]"
        >
          {submitting ? 'Enviando…' : 'Enviar mensaje'}
        </Button>
        <span className="inline-flex items-center gap-1.5 text-xs text-[#5c5246]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#1e6b4a]" aria-hidden="true" />
          No compartimos sus datos con terceros.
        </span>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-[#5c5246]">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
        Respondemos en días hábiles. Para temas urgentes, WhatsApp al {OPERATOR.phone}.
      </p>
    </form>
  );
}
