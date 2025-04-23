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
      const tagline = selectAll('.tagline');
      const cabecalho = selectAll('.cabecalho');
      const diferencial = selectAll('.diferencial');

      tl.from(isotype, { opacity: 0, y: -40 })
        .from(combinationMark, { opacity: 0, y: -40 }, '-=0.7')
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

      // ScrollTrigger: animações para cada <section>
      const sections = selectAll('section');
      sections.forEach((section: Element, idx: number) => {
        gsap.from(section, {
          opacity: 0,
          y: 60,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 80%',
            toggleActions: 'play none none reverse',
          },
          delay: 0.1 * idx,
        });
      });
    });
  }
}
