import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  Inject,
  NgZone,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

/**
 * O componente raiz da aplicação.
 *
 * Responsável por carregar a animação de apresentação do logotipo e do texto.
 */
@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
})
export class AppComponent implements AfterViewInit {
  private elementRef = inject(ElementRef);
  readonly PHONE_NUMBER = '+5581981310778';
  consultaForm: FormGroup = new FormGroup({
    nome: new FormControl('', Validators.required),
    email: new FormControl('', [Validators.required, Validators.email]),
    idade: new FormControl('', Validators.required),
    regiao: new FormControl('', Validators.required),
    sintomas: new FormControl('', Validators.required),
  });
  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private ngZone: NgZone
  ) {}

  enviarWhatsApp() {
    if (this.consultaForm.valid) {
      const formData = this.consultaForm.value;
      const mensagem = `Olá, gostaria de agendar uma consulta.\n\n*Nome:* ${
        formData.nome
      }\n*Idade:* ${formData.idade}\n*Região:* ${
        formData.regiao
      }\n*Sintomas:* ${formData.sintomas}\n*E-mail:* ${
        formData.email || 'Não informado'
      }`;

      const urlWhatsApp = `https://wa.me/${
        this.PHONE_NUMBER
      }?text=${encodeURIComponent(mensagem)}`;
      window.open(urlWhatsApp, '_blank');
    }
  }
  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.ngZone.runOutsideAngular(() => {
      const select = (selector: string) =>
        this.elementRef.nativeElement.querySelector(selector);

      const selectAll = (selector: string): NodeListOf<Element> =>
        this.elementRef.nativeElement.querySelectorAll(selector);

      const tl = gsap.timeline({
        defaults: {
          duration: 1,
          ease: 'power3.out',
        },
      });

      // Elementos principais
      const isotype = select('#isotype');
      const combinationMark = select('#combination-mark');
      const isotypePaths = selectAll('#isotype path');
      const logotype = select('#logotype');
      const wordmark = selectAll('#wordmark path');
      const tagline = selectAll('#tagline path');
      const cabecalho = selectAll('#cabecalho *');
      const cabecalho_h1 = select('#cabecalho > h1');
      const cabecalho_p = select('#cabecalho > p');
      const cabecalho_a = select('#cabecalho > a');
      const diferencial = selectAll('#diferencial > div');

      // Animação principal
      tl.to(isotype, { x: 64, duration: 0.06 })
        .to(logotype, { x: -36, duration: 0.06 })
        .to(cabecalho, { opacity: 0, y: 4, duration: 0.06 })
        .to(diferencial, { opacity: 0, y: 4, duration: 0.06 })
        .from(combinationMark, {
          scale: 0,
          opacity: 0,
          duration: 1,
          ease: 'elastic.out(1, 0.5)',
        })
        .from(
          isotypePaths,
          {
            stagger: 0.1,
            scale: 0,
            opacity: 0,
            transformOrigin: 'center',
            ease: 'bounce.out',
          },
          '-=0.8'
        )
        .to(isotype, { x: 0 })
        .to(logotype, { x: 0 }, '-=1')
        // Animação do texto
        .from(
          wordmark,
          {
            opacity: 0,
            scale: 0.1,
          },
          '-=1'
        )
        .from(
          tagline,
          {
            stagger: 0.07,
            scale: 0,
            opacity: 0,
            transformOrigin: 'center',
            ease: 'bounce.out',
          },
          '-=1.2'
        )
        .to(
          cabecalho,
          {
            opacity: 1,
            y: 0,
            duration: 1,
            stagger: 0.1,
          },
          '-=1.2'
        )
        .to(
          diferencial,
          {
            opacity: 1,
            y: 0,
            duration: 1,
            stagger: 0.1,
          },
          '-=0.8'
        );
    });
  }
}
