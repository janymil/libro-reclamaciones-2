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
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsVisible(true);
    
    // Mouse tracking for parallax effects
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const features = [
    {
      icon: Brain,
      title: "Asistencia IA",
      description: "Herramientas de clasificación automática y sugerencias de respuesta para agilizar el proceso",
      color: "from-purple-500 to-pink-500",
      stats: "Automático"
    },
    {
      icon: Shield,
      title: "Cumplimiento Legal",
      description: "Diseñado para cumplir con DS 011-2011-PCM, DS 101-2022-PCM y Ley 29733 de Protección de Datos",
      color: "from-green-500 to-emerald-500",
      stats: "Normativo"
    },
    {
      icon: Clock,
      title: "Gestión de Plazos",
      description: "Cálculo automático de 15 días hábiles según normativa peruana con alertas preventivas",
      color: "from-blue-500 to-cyan-500",
      stats: "15 días"
    },
    {
      icon: BarChart3,
      title: "Reportes",
      description: "Dashboard con métricas de seguimiento y reportes para análisis de reclamaciones",
      color: "from-orange-500 to-red-500",
      stats: "Dashboard"
    }
  ];


  const plans = [
    {
      name: "Starter",
      price: "Gratis",
      period: "",
      description: "Plan gratuito para comenzar",
      features: [
        "Hasta 10 reclamaciones",
        "1 usuario",
        "1 empresa",
        "Funciones básicas",
        "Soporte por email"
      ],
      popular: false,
      color: "border-gray-200"
    },
    {
      name: "Business",
      price: "S/ 9.90",
      period: "/mes",
      description: "Ideal para empresas en crecimiento",
      features: [
        "Reclamaciones ilimitadas",
        "Usuarios ilimitados",
        "Múltiples establecimientos",
        "Reportes completos",
        "Soporte prioritario",
        "S/ 99 al año (2 meses gratis)"
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
        "Todo del plan Business",
        "Multi-empresa y multi-marca",
        "Integraciones avanzadas",
        "Auditoría y compliance",
        "API personalizada",
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
              <Link href="/auth?mode=login">
                <Button variant="outline" className="mr-2">Iniciar Sesión</Button>
              </Link>
              <Link href="/auth?mode=register">
                <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                  Empezar
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
                Plataforma para Libros de Reclamaciones
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
                Plataforma digital para gestionar libros de reclamaciones con 
                <strong> cumplimiento legal</strong> de las normas peruanas. 
                Automatiza procesos y facilita el seguimiento de reclamaciones.
              </p>

              <div className="flex justify-center mb-12">
                <Link href="/auth?mode=register">
                  <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-lg px-8 py-4 h-auto">
                    <PlayCircle className="h-5 w-5 mr-2" />
                    Probar Plataforma
                  </Button>
                </Link>
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
              Características
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                de la Plataforma
              </span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Herramientas diseñadas para facilitar la gestión de reclamaciones 
              y el cumplimiento de las normas peruanas.
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
                <h3 className="text-3xl font-bold mb-4">Marco Legal Peruano</h3>
                <p className="text-xl text-green-100 mb-6 max-w-4xl mx-auto">
                  Desarrollado siguiendo los requerimientos de las normas peruanas vigentes para 
                  la gestión de libros de reclamaciones y protección de datos personales.
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
              Comienza gratis, crece con tu negocio
            </p>
            <p className="text-sm text-gray-500">
              Plan Business: Ahorra 20% pagando anualmente (S/ 99/año vs S/ 118.80/año mensual)
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Prueba la Plataforma
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Explora las funcionalidades de gestión de libros de reclamaciones 
            desarrolladas para el marco legal peruano.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
            <Link href="/auth?mode=register">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 text-lg px-8 py-4 h-auto">
                <PlayCircle className="h-5 w-5 mr-2" />
                Acceder al Sistema
              </Button>
            </Link>
          </div>

          <div className="mt-12 flex items-center justify-center space-x-8 text-blue-200">
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>Seguro</span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Rápido</span>
            </div>
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Fácil</span>
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
                Plataforma en desarrollo para la gestión digital de libros de reclamaciones 
                siguiendo el marco normativo peruano.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Sistema</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#features" className="hover:text-white transition-colors">Características</a></li>
                <li><a href="/dashboard" className="hover:text-white transition-colors">Dashboard</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Desarrollo</h3>
              <ul className="space-y-2 text-gray-400">
                <li><span className="text-gray-500">Beta</span></li>
                <li><span className="text-gray-500">En Desarrollo</span></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Legal</h3>
              <ul className="space-y-2 text-gray-400">
                <li><span className="text-gray-500">Marco Normativo</span></li>
                <li><span className="text-gray-500">Peruano</span></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400">
            <p>&copy; 2024 LibroVirtual.pe. Sistema en desarrollo.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}