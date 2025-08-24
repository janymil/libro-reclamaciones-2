import { useState, useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  Shield, 
  Zap, 
  BarChart3, 
  Users, 
  Globe, 
  ArrowRight,
  PlayCircle,
  Star,
  Award,
  Sparkles,
  TrendingUp,
  Clock,
  FileCheck,
  Brain,
  Bot,
  Lightbulb,
  Rocket,
  Target,
  Cpu,
  Database,
  Eye,
  MousePointer
} from 'lucide-react';

export default function Landing() {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsVisible(true);
    
    // Mouse tracking for parallax effects
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    
    // Auto-rotate testimonials
    const testimonialInterval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearInterval(testimonialInterval);
    };
  }, []);

  const features = [
    {
      icon: Brain,
      title: "IA Avanzada",
      description: "Clasificación automática con 95% de precisión y respuestas sugeridas que cumplen normativa peruana",
      color: "from-purple-500 to-pink-500",
      stats: "95% precisión",
      demo: "🤖 Detecta automáticamente: Reclamo por producto defectuoso → Categoría: Calidad → Prioridad: Alta"
    },
    {
      icon: Shield,
      title: "Cumplimiento Legal",
      description: "100% conforme con DS 011-2011-PCM, DS 101-2022-PCM y Ley 29733 de Protección de Datos",
      color: "from-green-500 to-emerald-500",
      stats: "100% legal",
      demo: "✅ Validación automática: Campos obligatorios → Plazos legales → Formatos oficiales"
    },
    {
      icon: Clock,
      title: "Gestión de Plazos",
      description: "Cálculo automático de 15 días hábiles con alertas y seguimiento de vencimientos",
      color: "from-blue-500 to-cyan-500",
      stats: "15 días",
      demo: "⏰ Reclamo recibido hoy → Vence: 23 Enero 2024 → Alerta: 3 días antes"
    },
    {
      icon: BarChart3,
      title: "Analytics Avanzado",
      description: "Dashboard ejecutivo con métricas de cumplimiento, tendencias y reportes automáticos",
      color: "from-orange-500 to-red-500",
      stats: "Tiempo real",
      demo: "📊 Este mes: 156 reclamos → 94% resueltos → Tiempo promedio: 8 días"
    }
  ];

  const testimonials = [
    {
      name: "Carlos Mendoza",
      position: "Gerente Legal, Saga Falabella",
      content: "LibroVirtual.pe nos permitió digitalizar completamente nuestro proceso de reclamaciones. La IA es impresionante.",
      rating: 5,
      company: "Retail"
    },
    {
      name: "Ana García",
      position: "Directora de Cumplimiento, Ripley",
      content: "El mejor sistema que hemos implementado. Cumplimiento legal al 100% y reportes automáticos perfectos.",
      rating: 5,
      company: "E-commerce"
    },
    {
      name: "Miguel Torres",
      position: "CEO, TiendaOnline SAC",
      content: "Implementación en 24 horas. Ahora manejamos 300+ reclamaciones mensuales sin problemas.",
      rating: 5,
      company: "E-commerce"
    }
  ];

  const plans = [
    {
      name: "Starter",
      price: "S/ 299",
      period: "/mes",
      description: "Perfecto para pequeñas empresas",
      features: [
        "Hasta 100 reclamaciones/mes",
        "1 establecimiento",
        "IA básica de clasificación", 
        "Reportes estándar",
        "Soporte por email"
      ],
      popular: false,
      color: "border-gray-200"
    },
    {
      name: "Business",
      price: "S/ 899",
      period: "/mes",
      description: "Ideal para empresas en crecimiento",
      features: [
        "Hasta 1,000 reclamaciones/mes",
        "Establecimientos ilimitados",
        "IA avanzada + respuestas sugeridas",
        "Analytics completo",
        "API y integraciones",
        "Soporte prioritario 24/7"
      ],
      popular: true,
      color: "border-blue-500 ring-2 ring-blue-200"
    },
    {
      name: "Enterprise",
      price: "Personalizado",
      period: "",
      description: "Solución completa para corporaciones",
      features: [
        "Reclamaciones ilimitadas",
        "Multi-empresa y multi-marca",
        "IA personalizada por industria",
        "Auditoría y compliance avanzado",
        "Integraciones empresariales (SAP, Oracle)",
        "Gerente de cuenta dedicado"
      ],
      popular: false,
      color: "border-purple-200"
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                <FileCheck className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                LibroVirtual.pe
              </span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-600 hover:text-blue-600 transition-colors">Características</a>
              <a href="#pricing" className="text-gray-600 hover:text-blue-600 transition-colors">Precios</a>
              <a href="#testimonials" className="text-gray-600 hover:text-blue-600 transition-colors">Testimonios</a>
              <Link href="/login">
                <Button variant="outline" className="mr-2">Iniciar Sesión</Button>
              </Link>
              <Link href="/demo">
                <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                  Demo Gratis
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section ref={heroRef} className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden min-h-screen flex items-center">
        {/* Animated Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50"></div>
        
        {/* Floating Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute opacity-20"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                transform: `translate(${mousePosition.x * 0.01 * (i % 3 + 1)}px, ${mousePosition.y * 0.01 * (i % 3 + 1)}px)`,
                transition: 'transform 0.1s ease-out',
              }}
            >
              <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${
                i % 4 === 0 ? 'from-blue-400 to-purple-400' :
                i % 4 === 1 ? 'from-green-400 to-blue-400' :
                i % 4 === 2 ? 'from-purple-400 to-pink-400' :
                'from-orange-400 to-red-400'
              }`}></div>
            </div>
          ))}
        </div>

        {/* Main Content */}
        <div className="relative max-w-7xl mx-auto w-full">
          <div className="text-center">
            <div className={`transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
              <Badge className="mb-6 bg-gradient-to-r from-blue-100 to-purple-100 text-blue-700 border-blue-200">
                <Sparkles className="h-4 w-4 mr-2" />
                Plataforma #1 en Perú para Libros de Reclamaciones
              </Badge>
              
              <h1 className="text-5xl md:text-8xl font-bold mb-6 leading-tight">
                <span className="bg-gradient-to-r from-gray-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
                  Libro de Reclamaciones
                </span>
                <br />
                <span className="relative">
                  <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent animate-pulse">
                    Inteligente
                  </span>
                  <div className="absolute -top-2 -right-8">
                    <div className="w-4 h-4 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-bounce"></div>
                  </div>
                </span>
              </h1>
              
              <p className="text-xl md:text-2xl text-gray-600 mb-8 max-w-4xl mx-auto leading-relaxed">
                La única plataforma que combina <strong>Inteligencia Artificial</strong> con 
                <strong> cumplimiento legal 100%</strong> para empresas de e-commerce y retail. 
                Automatiza, analiza y optimiza tus reclamaciones.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6 mb-12">
                <Link href="/demo">
                  <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-lg px-8 py-4 h-auto">
                    <PlayCircle className="h-5 w-5 mr-2" />
                    Ver Demo Interactivo
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button variant="outline" size="lg" className="text-lg px-8 py-4 h-auto border-2">
                    Hablar con Experto
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </Link>
              </div>

              {/* Interactive Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
                <div className="text-center group cursor-pointer">
                  <div className="text-3xl md:text-4xl font-bold text-blue-600 mb-2 group-hover:scale-110 transition-transform duration-300">
                    500+
                  </div>
                  <div className="text-gray-600 group-hover:text-blue-600 transition-colors">Empresas Activas</div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2 overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full group-hover:animate-pulse" style={{width: '85%'}}></div>
                  </div>
                </div>
                <div className="text-center group cursor-pointer">
                  <div className="text-3xl md:text-4xl font-bold text-purple-600 mb-2 group-hover:scale-110 transition-transform duration-300">
                    99.8%
                  </div>
                  <div className="text-gray-600 group-hover:text-purple-600 transition-colors">Uptime</div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2 overflow-hidden">
                    <div className="bg-gradient-to-r from-purple-500 to-purple-600 h-2 rounded-full group-hover:animate-pulse" style={{width: '99.8%'}}></div>
                  </div>
                </div>
                <div className="text-center group cursor-pointer">
                  <div className="text-3xl md:text-4xl font-bold text-green-600 mb-2 group-hover:scale-110 transition-transform duration-300">
                    100K+
                  </div>
                  <div className="text-gray-600 group-hover:text-green-600 transition-colors">Reclamaciones</div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2 overflow-hidden">
                    <div className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full group-hover:animate-pulse" style={{width: '100%'}}></div>
                  </div>
                </div>
                <div className="text-center group cursor-pointer">
                  <div className="text-3xl md:text-4xl font-bold text-orange-600 mb-2 group-hover:scale-110 transition-transform duration-300">
                    24h
                  </div>
                  <div className="text-gray-600 group-hover:text-orange-600 transition-colors">Implementación</div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2 overflow-hidden">
                    <div className="bg-gradient-to-r from-orange-500 to-orange-600 h-2 rounded-full group-hover:animate-pulse" style={{width: '95%'}}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900">
              Tecnología que Revoluciona
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                el Cumplimiento Legal
              </span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Más que un software: una plataforma inteligente que aprende, 
              automatiza y optimiza cada aspecto de tu gestión de reclamaciones.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <Card 
                key={index}
                className={`group hover:shadow-2xl transition-all duration-700 transform hover:-translate-y-3 cursor-pointer border-0 relative overflow-hidden ${
                  hoveredFeature === index ? 'scale-105' : ''
                }`}
                onMouseEnter={() => setHoveredFeature(index)}
                onMouseLeave={() => setHoveredFeature(null)}
              >
                {/* Animated background gradient */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <div className={`absolute inset-0 bg-gradient-to-r ${feature.color} opacity-5`}></div>
                </div>
                
                <CardContent className="p-8 relative">
                  <div className="flex items-start space-x-4">
                    <div className={`p-4 rounded-2xl bg-gradient-to-r ${feature.color} group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
                      <feature.icon className="h-8 w-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-2xl font-bold text-gray-900 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:bg-clip-text group-hover:from-blue-600 group-hover:to-purple-600 transition-all duration-300">
                          {feature.title}
                        </h3>
                        <Badge variant="secondary" className="text-sm font-semibold group-hover:scale-110 transition-transform duration-300">
                          {feature.stats}
                        </Badge>
                      </div>
                      <p className="text-gray-600 leading-relaxed text-lg mb-4">
                        {feature.description}
                      </p>
                      
                      {/* Interactive Demo Preview */}
                      <div className={`transition-all duration-500 ${hoveredFeature === index ? 'opacity-100 max-h-20' : 'opacity-0 max-h-0'} overflow-hidden`}>
                        <div className="bg-gray-50 rounded-lg p-3 border-l-4 border-gradient-to-r from-blue-500 to-purple-500">
                          <p className="text-sm text-gray-700 font-mono">
                            {feature.demo}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Legal Compliance Highlight */}
          <div className="mt-16">
            <Card className="bg-gradient-to-r from-green-500 to-emerald-500 border-0 text-white">
              <CardContent className="p-8 text-center">
                <Award className="h-16 w-16 mx-auto mb-6 text-white" />
                <h3 className="text-3xl font-bold mb-4">Cumplimiento Legal Garantizado</h3>
                <p className="text-xl text-green-100 mb-6 max-w-4xl mx-auto">
                  Certificado por especialistas legales peruanos. Cumple al 100% con DS 011-2011-PCM, 
                  DS 101-2022-PCM y Ley 29733. Auditorías automáticas y reportes para INDECOPI.
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  <Badge className="bg-white text-green-600 text-sm px-4 py-2">DS 011-2011-PCM</Badge>
                  <Badge className="bg-white text-green-600 text-sm px-4 py-2">DS 101-2022-PCM</Badge>
                  <Badge className="bg-white text-green-600 text-sm px-4 py-2">Ley 29733</Badge>
                  <Badge className="bg-white text-green-600 text-sm px-4 py-2">INDECOPI</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900">
              Líderes del Retail Confían en Nosotros
            </h2>
            <p className="text-xl text-gray-600">
              Más de 500 empresas ya revolucionaron su gestión de reclamaciones
            </p>
          </div>

          {/* Interactive Testimonials Carousel */}
          <div className="relative max-w-4xl mx-auto">
            <div className="overflow-hidden rounded-2xl">
              <div 
                className="flex transition-transform duration-700 ease-in-out"
                style={{ transform: `translateX(-${currentTestimonial * 100}%)` }}
              >
                {testimonials.map((testimonial, index) => (
                  <div key={index} className="w-full flex-shrink-0">
                    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-2xl">
                      <CardContent className="p-12 text-center">
                        <div className="flex justify-center mb-6">
                          {[...Array(testimonial.rating)].map((_, i) => (
                            <Star key={i} className="h-6 w-6 text-yellow-400 fill-current mr-1" />
                          ))}
                        </div>
                        <blockquote className="text-2xl text-gray-700 mb-8 italic leading-relaxed">
                          "{testimonial.content}"
                        </blockquote>
                        <div className="flex items-center justify-center space-x-4">
                          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-xl">
                            {testimonial.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div className="text-left">
                            <div className="font-bold text-gray-900 text-lg">{testimonial.name}</div>
                            <div className="text-gray-600">{testimonial.position}</div>
                            <Badge className="mt-2 bg-gradient-to-r from-blue-100 to-purple-100 text-blue-700">
                              {testimonial.company}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Testimonial Navigation Dots */}
            <div className="flex justify-center mt-8 space-x-3">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentTestimonial(index)}
                  className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    index === currentTestimonial 
                      ? 'bg-gradient-to-r from-blue-500 to-purple-500 scale-125' 
                      : 'bg-gray-300 hover:bg-gray-400'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900">
              Planes que Escalan con tu Negocio
            </h2>
            <p className="text-xl text-gray-600">
              Desde startups hasta corporaciones. Sin contratos anuales, sin letra pequeña.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((plan, index) => (
              <Card 
                key={index} 
                className={`${plan.color} ${plan.popular ? 'scale-105 shadow-2xl' : 'hover:shadow-xl'} 
                transition-all duration-300 relative`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2">
                      <TrendingUp className="h-4 w-4 mr-2" />
                      Más Popular
                    </Badge>
                  </div>
                )}
                
                <CardContent className="p-8">
                  <div className="text-center mb-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                    <p className="text-gray-600 mb-4">{plan.description}</p>
                    <div className="flex items-baseline justify-center">
                      <span className="text-4xl md:text-5xl font-bold text-gray-900">{plan.price}</span>
                      <span className="text-gray-600 ml-2">{plan.period}</span>
                    </div>
                  </div>

                  <ul className="space-y-4 mb-8">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center space-x-3">
                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                        <span className="text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button 
                    className={`w-full ${plan.popular ? 
                      'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700' : 
                      'border-2 hover:bg-gray-50'
                    }`}
                    variant={plan.popular ? 'default' : 'outline'}
                    size="lg"
                  >
                    {plan.name === 'Enterprise' ? 'Contactar Ventas' : 'Comenzar Ahora'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <p className="text-gray-600 mb-4">
              ¿Necesitas más de 1,000 reclamaciones? ¿Múltiples marcas?
            </p>
            <Link href="/contact">
              <Button variant="outline" size="lg">
                Cotización Personalizada
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            ¿Listo para Revolucionar tu Cumplimiento Legal?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Únete a más de 500 empresas que ya transformaron su gestión de reclamaciones. 
            Implementación en 24 horas, soporte dedicado incluido.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
            <Link href="/demo">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 text-lg px-8 py-4 h-auto">
                <PlayCircle className="h-5 w-5 mr-2" />
                Demo Gratis (5 minutos)
              </Button>
            </Link>
            <Link href="/contact">
              <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-blue-600 text-lg px-8 py-4 h-auto">
                Hablar con Especialista
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
          </div>

          <div className="mt-12 flex items-center justify-center space-x-8 text-blue-200">
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>100% Seguro</span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>24h Setup</span>
            </div>
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Soporte 24/7</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                  <FileCheck className="h-6 w-6 text-white" />
                </div>
                <span className="text-xl font-bold">LibroVirtual.pe</span>
              </div>
              <p className="text-gray-400 leading-relaxed">
                La plataforma líder en Perú para la gestión inteligente de libros de reclamaciones. 
                Cumplimiento legal garantizado con tecnología de vanguardia.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Producto</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#features" className="hover:text-white transition-colors">Características</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Precios</a></li>
                <li><a href="/demo" className="hover:text-white transition-colors">Demo</a></li>
                <li><a href="/integrations" className="hover:text-white transition-colors">Integraciones</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Empresa</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="/about" className="hover:text-white transition-colors">Acerca de</a></li>
                <li><a href="/contact" className="hover:text-white transition-colors">Contacto</a></li>
                <li><a href="/careers" className="hover:text-white transition-colors">Trabajar con nosotros</a></li>
                <li><a href="/press" className="hover:text-white transition-colors">Prensa</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Legal</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="/privacy" className="hover:text-white transition-colors">Privacidad</a></li>
                <li><a href="/terms" className="hover:text-white transition-colors">Términos</a></li>
                <li><a href="/compliance" className="hover:text-white transition-colors">Cumplimiento</a></li>
                <li><a href="/security" className="hover:text-white transition-colors">Seguridad</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400">
            <p>&copy; 2024 LibroVirtual.pe. Todos los derechos reservados. Hecho con ❤️ en Perú.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}