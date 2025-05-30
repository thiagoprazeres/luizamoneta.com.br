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
    nascimento: new FormControl('', Validators.required),
    regiao: new FormControl('', Validators.required),
    sintomas: new FormControl('', Validators.required),
  });
  saudacao: string = '';
  dadosUsuario: any = {};
  enviado: boolean = false;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private ngZone: NgZone
  ) {
    this.definirSaudacao();
  }

  private definirSaudacao() {
    const hora = new Date().getHours();

    if (hora >= 5 && hora < 12) {
      this.saudacao = 'Bom dia';
    } else if (hora >= 12 && hora < 18) {
      this.saudacao = 'Boa tarde';
    } else {
      this.saudacao = 'Boa noite';
    }
  }

  formatarData(data: string): string {
    if (!data) return '';
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  enviarWhatsApp() {
    if (this.consultaForm.valid) {
      this.enviado = true;
      this.dadosUsuario = this.consultaForm.value;
      console.log(this.dadosUsuario);
      const dataNasc = this.formatarData(this.dadosUsuario.nascimento);
      const mensagem = `${
        this.saudacao
      }\n\nOlá, gostaria de agendar uma consulta.\n\n*Nome:* ${
        this.dadosUsuario.nome
      }\n*E-mail:* ${
        this.dadosUsuario.email || 'Não informado'
      }\n*Data de nascimento:* ${dataNasc}\n*Região:* ${
        this.dadosUsuario.regiao
      }\n*Sintomas:* ${this.dadosUsuario.sintomas}`;

      const urlWhatsApp = `https://wa.me/${
        this.PHONE_NUMBER
      }?text=${encodeURIComponent(mensagem)}`;
      window.open(urlWhatsApp, '_blank');
    }
  }

  corrigirDados() {
    this.enviado = false;
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
      const diferencial = selectAll('#diferencial > div');

      // Animação principal
      tl.to(isotype, { x: 64, duration: 0.08 })
        .to(logotype, { x: -36, duration: 0.08 })
        .to(cabecalho, { opacity: 0, y: 4, duration: 0.08 })
        .to(diferencial, { opacity: 0, y: 4, duration: 0.08 })
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

      // Refatoração GSAP/ScrollTrigger para animações das seções
      const sectionIds = [
        'sintomas',
        'tratamento',
        'especialidades',
        'justificativa',
        'agendamento',
        'dicas-habitos',
        'bem-estar',
      ];

      sectionIds.forEach((id) => {
        const el = select(`#${id} > div`);
        if (el) {
          const tl = gsap.timeline({
            defaults: { duration: 1, ease: 'power3.out' },
          });
          tl.from(el, { opacity: 0, y: 100 });
          ScrollTrigger.create({
            trigger: el,
            start: 'top 95%',
            end: 'top 25%',
            scrub: true,
            animation: tl,
          });
        }
      });
    });
  }
}
