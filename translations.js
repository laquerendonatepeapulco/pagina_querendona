(function () {
    const STORAGE_KEY = 'laQuerendonaLanguage';
    const SUPPORTED_LANGUAGES = ['es', 'en', 'fr'];
    const originalTextNodes = new WeakMap();
    const originalAttributes = new WeakMap();

    const translations = {
        en: {
            'Inicio': 'Home',
            'Menú': 'Menu',
            'Nosotros': 'About Us',
            'Nuestro Equipo': 'Our Team',
            'Contacto/Reserva': 'Contact/Reservations',
            'Historia': 'Story',
            'Sucursales': 'Locations',
            'RESERVAR': 'RESERVE',
            'Ubicación: Tepeapulco': 'Location: Tepeapulco',
            'Ubicación: Sahagún': 'Location: Sahagún',
            'Restaurante tradicional en Sahagún': 'Traditional restaurant in Sahagún',
            'Sucursal Ciudad Sahagún': 'Ciudad Sahagún location',
            'La Querendona Sahagún': 'La Querendona Sahagún',
            'Un espacio lleno de color, sabor casero y detalles mexicanos para disfrutar desayunos, antojitos y comida tradicional en un ambiente familiar.': 'A space full of color, homemade flavor, and Mexican details for enjoying breakfasts, antojitos, and traditional food in a family atmosphere.',
            'SABOR DE CASA': 'HOMEMADE FLAVOR',
            'Tradición mexicana con ambiente de Sahagún': 'Mexican tradition with Sahagún atmosphere',
            'Esta sucursal conserva la esencia de La Querendona con mesas coloridas, barro artesanal y platillos servidos con sazón familiar. Cada visita se siente cercana, alegre y hecha para compartir.': 'This location keeps the essence of La Querendona with colorful tables, handcrafted clayware, and dishes served with family flavor. Every visit feels warm, joyful, and made to share.',
            'Seleccionar': 'Select',
            'Restaurante tradicional en Tepeapulco': 'Traditional restaurant in Tepeapulco',
            'BIENVENIDO A': 'WELCOME TO',
            'Sabor, tradición y un ambiente familiar en el corazón de Tepeapulco, Hidalgo Disfruta de una experiencia auténtica con comida que hace sentir como en casa.': 'Flavor, tradition, and a family atmosphere in the heart of Tepeapulco, Hidalgo. Enjoy an authentic experience with food that feels like home.',
            'Sabor, tradición y un ambiente familiar en Ciudad Sahagún, Hidalgo. Disfruta de una experiencia auténtica con comida que hace sentir como en casa.': 'Flavor, tradition, and a family atmosphere in Ciudad Sahagún, Hidalgo. Enjoy an authentic experience with food that feels like home.',
            'Ver menú': 'View menu',
            'Reservar': 'Reserve',
            'Una experiencia única': 'A unique experience',
            'En La Querendona buscamos ofrecer una experiencia cálida y auténtica, mezclando tradición mexicana con un ambiente moderno y acogedor.': 'At La Querendona, we offer a warm and authentic experience that blends Mexican tradition with a modern, welcoming atmosphere.',
            'En La Querendona Sahagún buscamos ofrecer una experiencia cálida y auténtica, mezclando tradición mexicana con un ambiente moderno y acogedor.': 'At La Querendona Sahagún, we offer a warm and authentic experience that blends Mexican tradition with a modern, welcoming atmosphere.',
            'Comida con tradición': 'Food rooted in tradition',
            'Cada platillo está preparado con dedicación y sabores tradicionales para compartir momentos especiales con familia y amigos.': 'Each dish is prepared with care and traditional flavors for sharing special moments with family and friends.',
            'DESTACADOS': 'HIGHLIGHTS',
            'Desayunos tradicionales': 'Traditional breakfasts',
            'Chilaquiles, café, jugos y sabores de mañana servidos con el toque de casa.': 'Chilaquiles, coffee, juices, and morning flavors served with a homemade touch.',
            'Platillos con sazón': 'Dishes with flavor',
            'Recetas mexicanas servidas en barro, con porciones generosas y presentación cálida.': 'Mexican recipes served in clayware, with generous portions and a warm presentation.',
            'Ambiente colorido': 'Colorful atmosphere',
            'Un comedor con identidad mexicana, luces, detalles artesanales y un ambiente familiar.': 'A dining room with Mexican identity, lights, handcrafted details, and a family atmosphere.',
            'Sabores de Sahagún': 'Flavors of Sahagún',
            'Una mirada a los platillos y detalles que hacen especial a esta sucursal: barro, mesa mexicana, jugos frescos y antojitos preparados para compartir.': 'A look at the dishes and details that make this location special: clayware, Mexican table settings, fresh juices, and antojitos made to share.',
            'RESERVA Y VISÍTANOS': 'BOOK AND VISIT US',
            'Ven a disfrutar La Querendona Sahagún': 'Come enjoy La Querendona Sahagún',
            'Mantuvimos el mismo menú de navegación para que puedas explorar platillos, conocer al equipo o hacer una reservación desde cualquier sección.': 'We kept the same navigation menu so you can explore dishes, meet the team, or make a reservation from any section.',
            'Comida tradicional': 'Traditional food',
            'Platillos preparados con recetas auténticas y sabor casero.': 'Dishes prepared with authentic recipes and homemade flavor.',
            'Eventos y reuniones': 'Events and gatherings',
            'Espacios ideales para convivencias familiares y celebraciones.': 'Ideal spaces for family gatherings and celebrations.',
            'Servicio rápido': 'Fast service',
            'Atención rápida y ambiente cómodo para disfrutar sin prisas.': 'Prompt service and a comfortable atmosphere to enjoy at your own pace.',
            'Especialidades': 'Specialties',
            'Sobre nosotros': 'About us',
            'La Querendona es un restaurante pensado para compartir buenos momentos, disfrutar comida deliciosa y mantener viva la esencia de la cocina mexicana.': 'La Querendona is a restaurant created for sharing good times, enjoying delicious food, and keeping the essence of Mexican cuisine alive.',
            'La Querendona Sahagún es un restaurante pensado para compartir buenos momentos, disfrutar comida deliciosa y mantener viva la esencia de la cocina mexicana.': 'La Querendona Sahagún is a restaurant created for sharing good times, enjoying delicious food, and keeping the essence of Mexican cuisine alive.',
            'Nuestro objetivo es brindar un ambiente cálido, familiar y lleno de sabor.': 'Our goal is to provide a warm, family-friendly atmosphere full of flavor.',
            'Conócenos →': 'Get to know us →',
            'Sabor tradicional mexicano': 'Traditional Mexican flavor',
            '¡¡ DESCUBRE NUESTRO MENÚ !!': 'DISCOVER OUR MENU!',
            'Descubre nuestros platillos preparados con ingredientes frescos,tradición y el auténtico sabor de La Querendona.': 'Discover our dishes prepared with fresh ingredients, tradition, and the authentic flavor of La Querendona.',
            'Explorar menú': 'Explore menu',
            'RECOMENDACIÓN': 'RECOMMENDATION',
            'Platillo especial del chef': "Chef's special",
            'Preparado diariamente con ingredientes frescos y recetas tradicionales.': 'Prepared daily with fresh ingredients and traditional recipes.',
            'Quesabirria preparada con tortilla dorada, queso fundido y carne jugosa cocinada lentamente. Se acompaña con consomé caliente, cebolla, cilantro y limón para disfrutar cada bocado con el sabor casero que distingue a La Querendona.': 'Quesabirria prepared with a crispy tortilla, melted cheese, and juicy slow-cooked meat. Served with hot consomme, onion, cilantro, and lime so every bite carries the homemade flavor that makes La Querendona special.',
            'NUESTRO MENÚ': 'OUR MENU',
            '❤️😋 SABORES QUE ENAMORAN 😋❤️': '❤️😋 FLAVORS TO FALL IN LOVE WITH 😋❤️',
            'Descubre nuestros platillos tradicionales, preparados con ingredientes frescos y auténticos.': 'Discover our traditional dishes, prepared with fresh, authentic ingredients.',
            'Descargar menú PDF': 'Download menu PDF',
            'Nuestra historia': 'Our history',
            'Tradición, sabor y familia': 'Tradition, flavor, and family',
            'En La Querendona compartimos la riqueza de la cocina tradicional mexicana con calidad, hospitalidad y sabor casero.': 'At La Querendona, we share the richness of traditional Mexican cuisine with quality, hospitality, and homemade flavor.',
            'NUESTRA ESENCIA': 'OUR ESSENCE',
            'Un restaurante hecho con pasión mexicana': 'A restaurant made with Mexican passion',
            'La Querendona fue fundada en 2021 bajo la inspiración del Sr. Horacio Molina Silva, con la visión de crear un espacio especializado en comida típica mexicana.': 'La Querendona was founded in 2021, inspired by Mr. Horacio Molina Silva and his vision of creating a place devoted to traditional Mexican food.',
            'Nuestra primera sucursal abrió en Ciudad Sahagún, Hidalgo, y posteriormente llegó la sucursal de Tepeapulco, conservando el estilo mexicano, el menú, la coctelería y el sazón casero que nos distingue.': 'Our first location opened in Ciudad Sahagún, Hidalgo, followed by our Tepeapulco location, preserving the Mexican style, menu, cocktails, and homemade flavor that set us apart.',
            'Hoy seguimos creciendo con el mismo propósito: ofrecer platillos inspirados en la gastronomía mexicana y una experiencia cálida, familiar y relajada.': 'Today we continue growing with the same purpose: offering dishes inspired by Mexican cuisine and a warm, relaxed, family-friendly experience.',
            'FILOSOFÍA INSTITUCIONAL': 'OUR PHILOSOPHY',
            'Nuestra forma de servir': 'The way we serve',
            'Trabajamos con identidad, pasión y compromiso para preservar los sabores tradicionales de México y brindar a cada comensal una experiencia de calidad.': 'We work with identity, passion, and commitment to preserve the traditional flavors of Mexico and provide every guest with a quality experience.',
            'MISIÓN': 'MISSION',
            'Resaltar la cocina tradicional mexicana': 'Celebrate traditional Mexican cuisine',
            'Somos un restaurante que busca ofrecer una experiencia culinaria que celebre la riqueza de la cocina tradicional mexicana, cuidando la técnica, el arte en la preparación y cada detalle del servicio.': 'We are a restaurant that offers a culinary experience celebrating the richness of traditional Mexican cuisine, with care for technique, preparation, and every detail of service.',
            'VISIÓN': 'VISION',
            'Ser un referente gastronómico': 'Become a culinary benchmark',
            'Aspiramos a consolidarnos como un referente de la gastronomía tradicional mexicana, preservando sus sabores y tradiciones con autenticidad, calidad y confianza.': 'We aim to become a benchmark for traditional Mexican cuisine by preserving its flavors and traditions with authenticity, quality, and trust.',
            'OBJETIVO GENERAL': 'GENERAL OBJECTIVE',
            'Fortalecer nuestra presencia en la región mediante un crecimiento estratégico, manteniendo la calidad de nuestros productos, el reconocimiento de marca y una experiencia que haga sentir a cada cliente cobijado por la esencia de México.': 'Strengthen our presence in the region through strategic growth while maintaining product quality, brand recognition, and an experience that surrounds every guest with the essence of Mexico.',
            'Lo que nos representa': 'What represents us',
            'Autenticidad': 'Authenticity',
            'Preservamos la esencia culinaria de la cocina tradicional mexicana en cada platillo.': 'We preserve the culinary essence of traditional Mexican cuisine in every dish.',
            'Pasión': 'Passion',
            'Compartimos con clientes y colaboradores la inspiración por la gastronomía y las tradiciones mexicanas.': 'We share our inspiration for Mexican cuisine and traditions with guests and team members.',
            'Calidad': 'Quality',
            'Buscamos distinción y excelencia en nuestros productos, procesos y servicio.': 'We pursue distinction and excellence in our products, processes, and service.',
            'Hospitalidad': 'Hospitality',
            'Brindamos una experiencia acogedora para que cada cliente se sienta cobijado por la esencia de México.': 'We provide a welcoming experience so every guest feels embraced by the essence of Mexico.',
            'Respeto': 'Respect',
            'Promovemos un ambiente cordial donde se honra la diversidad, se cuidan nuestras tradiciones y se ofrece un trato justo.': 'We foster a friendly environment that honors diversity, cares for our traditions, and treats everyone fairly.',
            'Tradición': 'Tradition',
            'Conservamos los sabores, costumbres y recetas que dan identidad a la gastronomía mexicana.': 'We preserve the flavors, customs, and recipes that give Mexican cuisine its identity.',
            'EXPERIENCIA': 'EXPERIENCE',
            'Mucho más que un restaurante': 'Much more than a restaurant',
            'Queremos que cada visita se convierta en una experiencia memorable llena de sabor, comodidad y tradición.': 'We want every visit to become a memorable experience filled with flavor, comfort, and tradition.',
            'Talento y tradición mexicana': 'Mexican talent and tradition',
            'CONOCE A': 'MEET',
            'Nuestro Equipo': 'Our Team',
            'Detrás de cada platillo existe pasión, creatividad y tradición mexicana. Nuestro equipo culinario transforma ingredientes frescos en experiencias inolvidables.': 'Behind every dish are passion, creativity, and Mexican tradition. Our culinary team transforms fresh ingredients into unforgettable experiences.',
            'NUESTROS CHEFS': 'OUR CHEFS',
            'Detrás de cada platillo hay técnica, pasión y dedicación. Nuestro equipo de cocina cuida cada detalle para servir sabores auténticos y momentos memorables.': 'Behind every dish are technique, passion, and dedication. Our kitchen team cares for every detail to serve authentic flavors and memorable moments.',
            'NUESTROS MESEROS': 'OUR WAITSTAFF',
            'Nuestro personal de servicio acompaña cada visita con atención cercana, calidez y cuidado en cada detalle para que todos se sientan como en casa.': 'Our service team accompanies every visit with attentive care, warmth, and attention to detail so everyone feels at home.',
            'ATENCIÓN EN MESA': 'TABLE SERVICE',
            'Mesera Alejandra': 'Waitress Alejandra',
            'Brinda una atención amable y atenta, cuidando que cada mesa tenga una experiencia cómoda desde la bienvenida hasta la despedida.': 'She provides friendly, attentive service, making sure every table has a comfortable experience from welcome to farewell.',
            'Servicio': 'Service',
            'Calidez': 'Warmth',
            'Detalle': 'Detail',
            'SERVICIO AL CLIENTE': 'CUSTOMER SERVICE',
            'Mesero Jovani': 'Waiter Jovani',
            'Acompaña a los clientes con trato cordial, rapidez y buena disposición para que disfruten cada momento en La Querendona.': 'He accompanies guests with friendly treatment, speed, and a good attitude so they enjoy every moment at La Querendona.',
            'Rapidez': 'Speed',
            'Atención': 'Attention',
            'Cordialidad': 'Courtesy',
            'HOSPITALIDAD': 'HOSPITALITY',
            'Mesero Paco': 'Waiter Paco',
            'Comparte la esencia familiar del restaurante con una atención respetuosa, cercana y lista para hacer sentir bienvenido a cada comensal.': 'He shares the restaurant’s family spirit with respectful, warm service that makes every guest feel welcome.',
            'Hospitalidad': 'Hospitality',
            'Amabilidad': 'Kindness',
            'Confianza': 'Trust',
            'CHEF PRINCIPAL': 'HEAD CHEF',
            'Especialista en cocina mexicana tradicional y parrilla. Su pasión es conservar los sabores auténticos que representan la esencia de La Querendona.': 'A specialist in traditional Mexican cuisine and grilling. His passion is preserving the authentic flavors that represent the essence of La Querendona.',
            'Parrilla': 'Grill',
            'Molcajetes': 'Molcajetes',
            'SABORES & EXPERIENCIAS': 'FLAVORS & EXPERIENCES',
            'Encargada de crear experiencias cálidas y modernas combinando recetas caseras con una presentación elegante y auténtica.': 'Dedicated to creating warm, modern experiences by combining homemade recipes with an elegant and authentic presentation.',
            'Bebidas': 'Drinks',
            'Postres': 'Desserts',
            '“La cocina mexicana no solo se sirve, se comparte con el corazón.”': '“Mexican cuisine is not only served; it is shared from the heart.”',
            'CONTÁCTANOS': 'CONTACT US',
            'Reserva y vive la experiencia': 'Book and enjoy the experience',
            'Estamos listos para recibirte en La Querendona. Disfruta de nuestros sabores tradicionales en un ambiente cálido y familiar.': 'We are ready to welcome you to La Querendona. Enjoy our traditional flavors in a warm, family-friendly atmosphere.',
            'Información': 'Information',
            'Ubicación': 'Location',
            'Ubicaciones': 'Locations',
            'Tepeapulco': 'Tepeapulco',
            'Ciudad Sahagún': 'Ciudad Sahagún',
            'Horario': 'Hours',
            'Lunes a Domingo': 'Monday to Sunday',
            'Haz una reservación': 'Make a reservation',
            'No. de cliente': 'Customer No.',
            'Elija la Sucursal de su agrado': 'Choose your preferred location',
            'Tepeapulco, Hidalgo': 'Tepeapulco, Hidalgo',
            'Ciudad Sahagún, Hidalgo': 'Ciudad Sahagún, Hidalgo',
            'Nombre completo': 'Full name',
            'Correo electrónico': 'Email address',
            'Número telefónico': 'Phone number',
            'Número de personas': 'Number of guests',
            'Hora de la reserva': 'Reservation time',
            'Selecciona la hora': 'Select a time',
            'Tipo de celebración': 'Celebration type',
            'Sin celebración especial': 'No special celebration',
            'Cumpleaños': 'Birthday',
            'Aniversario': 'Anniversary',
            'Reunión familiar': 'Family gathering',
            'Reunión de amigos': 'Friends gathering',
            'Graduación': 'Graduation',
            'Evento empresarial': 'Corporate event',
            'Otro': 'Other',
            'Mensaje o detalles adicionales': 'Additional message or details',
            'Reservar ahora': 'Reserve now',
            'Encuéntranos': 'Find us',
            'Síguenos': 'Follow us',
            'Todos los derechos reservados': 'All rights reserved',
            'Sabor, tradición y familia en Tepeapulco.': 'Flavor, tradition, and family in Tepeapulco.',
            'Sabor, tradición y familia en Sahagún.': 'Flavor, tradition, and family in Sahagún.',
            'Enlaces rápidos': 'Quick links',
            'CONTACTO': 'CONTACT',
            'Visítanos': 'Visit us',
            'Av. Juárez, Centro, Tepeapulco, Hgo.': 'Av. Juarez, Centro, Tepeapulco, Hgo.',
            'Ciudad Sahagún, Hidalgo.': 'Ciudad Sahagún, Hidalgo.',
            'Carr. Pachuca - Cd. Sahagún Manzana #1-Lote 10, Vicente Guerrero, 43998 Cd Sahagún, Hgo.': 'Carr. Pachuca - Cd. Sahagún Manzana #1-Lote 10, Vicente Guerrero, 43998 Cd Sahagún, Hgo.',
            'Lunes a Domingo · 9:00 AM - 9:00 PM': 'Monday to Sunday · 9:00 AM - 9:00 PM',
            'Reservaciones': 'Reservations',
            'WhatsApp +52 775 105 1325': 'WhatsApp +52 775 105 1325',
            '© 2026 La Querendona. Todos los derechos reservados.': '© 2026 La Querendona. All rights reserved.',
            'Sitio oficial de La Querendona Tepeapulco.': 'Official website of La Querendona Tepeapulco.',
            'Sitio oficial de La Querendona Sahagún.': 'Official website of La Querendona Sahagún.',
            '© 2026 Todos los derechos reservados': '© 2026 All rights reserved',
            'Activar sonido': 'Turn sound on',
            'Silenciar video': 'Mute video',
            'Añadido': 'Added',
            'Añadido correctamente': 'Added successfully',
            'Hola, quiero hacer una reservación en La Querendona.': 'Hello, I would like to make a reservation at La Querendona.',
            'Nombre': 'Name',
            'Correo': 'Email',
            'Teléfono': 'Phone',
            'Personas': 'Guests',
            'Sucursal': 'Location',
            'Fecha': 'Date',
            'Hora': 'Time',
            'Detalles': 'Details',
            'Sin detalles adicionales': 'No additional details',
            '¿Me pueden confirmar disponibilidad?': 'Could you please confirm availability?',
            'Te llevamos a WhatsApp para confirmar tu reservación.': 'We are taking you to WhatsApp to confirm your reservation.',
            'Guardando reservación...': 'Saving reservation...',
            'Reservación registrada. Te llevamos a WhatsApp para confirmar.': 'Reservation saved. We are taking you to WhatsApp to confirm.',
            'No pudimos registrar tu reservación. Inténtalo de nuevo o contáctanos por WhatsApp.': 'We could not save your reservation. Please try again or contact us on WhatsApp.',
            'La Querendona | Restaurante en Tepeapulco': 'La Querendona | Restaurant in Tepeapulco',
            'La Querendona | Restaurante en Sahagún': 'La Querendona | Restaurant in Sahagún',
            'La Querendona | Menú': 'La Querendona | Menu',
            'La Querendona | Contacto': 'La Querendona | Contact',
            'Seleccionar Restaurante - La Querendona': 'Select a Restaurant - La Querendona'
        },
        fr: {
            'Inicio': 'Accueil',
            'Menú': 'Menu',
            'Nosotros': 'À propos',
            'Nuestro Equipo': 'Notre équipe',
            'Contacto/Reserva': 'Contact/Réservation',
            'Historia': 'Histoire',
            'Sucursales': 'Établissements',
            'RESERVAR': 'RÉSERVER',
            'Ubicación: Tepeapulco': 'Adresse : Tepeapulco',
            'Ubicación: Sahagún': 'Adresse : Sahagún',
            'Restaurante tradicional en Sahagún': 'Restaurant traditionnel à Sahagún',
            'Sucursal Ciudad Sahagún': 'Établissement Ciudad Sahagún',
            'La Querendona Sahagún': 'La Querendona Sahagún',
            'Un espacio lleno de color, sabor casero y detalles mexicanos para disfrutar desayunos, antojitos y comida tradicional en un ambiente familiar.': 'Un espace plein de couleurs, de saveurs maison et de détails mexicains pour savourer des petits-déjeuners, des antojitos et une cuisine traditionnelle dans une ambiance familiale.',
            'SABOR DE CASA': 'SAVEUR MAISON',
            'Tradición mexicana con ambiente de Sahagún': 'Tradition mexicaine dans l’ambiance de Sahagún',
            'Esta sucursal conserva la esencia de La Querendona con mesas coloridas, barro artesanal y platillos servidos con sazón familiar. Cada visita se siente cercana, alegre y hecha para compartir.': 'Cet établissement conserve l’essence de La Querendona avec des tables colorées, de la vaisselle artisanale en terre cuite et des plats servis avec une saveur familiale. Chaque visite est chaleureuse, joyeuse et faite pour être partagée.',
            'Seleccionar': 'Sélectionner',
            'Restaurante tradicional en Tepeapulco': 'Restaurant traditionnel à Tepeapulco',
            'BIENVENIDO A': 'BIENVENUE À',
            'Sabor, tradición y un ambiente familiar en el corazón de Tepeapulco, Hidalgo Disfruta de una experiencia auténtica con comida que hace sentir como en casa.': 'Saveurs, tradition et ambiance familiale au cœur de Tepeapulco, Hidalgo. Profitez d’une expérience authentique et d’une cuisine comme à la maison.',
            'Sabor, tradición y un ambiente familiar en Ciudad Sahagún, Hidalgo. Disfruta de una experiencia auténtica con comida que hace sentir como en casa.': 'Saveurs, tradition et ambiance familiale à Ciudad Sahagún, Hidalgo. Profitez d’une expérience authentique et d’une cuisine comme à la maison.',
            'Ver menú': 'Voir le menu',
            'Reservar': 'Réserver',
            'Una experiencia única': 'Une expérience unique',
            'En La Querendona buscamos ofrecer una experiencia cálida y auténtica, mezclando tradición mexicana con un ambiente moderno y acogedor.': 'À La Querendona, nous proposons une expérience chaleureuse et authentique qui unit la tradition mexicaine à une ambiance moderne et accueillante.',
            'En La Querendona Sahagún buscamos ofrecer una experiencia cálida y auténtica, mezclando tradición mexicana con un ambiente moderno y acogedor.': 'À La Querendona Sahagún, nous proposons une expérience chaleureuse et authentique qui unit la tradition mexicaine à une ambiance moderne et accueillante.',
            'Comida con tradición': 'Une cuisine de tradition',
            'Cada platillo está preparado con dedicación y sabores tradicionales para compartir momentos especiales con familia y amigos.': 'Chaque plat est préparé avec soin et des saveurs traditionnelles pour partager des moments privilégiés en famille et entre amis.',
            'DESTACADOS': 'À DÉCOUVRIR',
            'Desayunos tradicionales': 'Petits-déjeuners traditionnels',
            'Chilaquiles, café, jugos y sabores de mañana servidos con el toque de casa.': 'Chilaquiles, café, jus et saveurs du matin servis avec une touche maison.',
            'Platillos con sazón': 'Plats pleins de saveur',
            'Recetas mexicanas servidas en barro, con porciones generosas y presentación cálida.': 'Recettes mexicaines servies dans de la terre cuite, avec des portions généreuses et une présentation chaleureuse.',
            'Ambiente colorido': 'Ambiance colorée',
            'Un comedor con identidad mexicana, luces, detalles artesanales y un ambiente familiar.': 'Une salle avec une identité mexicaine, des lumières, des détails artisanaux et une ambiance familiale.',
            'Sabores de Sahagún': 'Saveurs de Sahagún',
            'Una mirada a los platillos y detalles que hacen especial a esta sucursal: barro, mesa mexicana, jugos frescos y antojitos preparados para compartir.': 'Un aperçu des plats et des détails qui rendent cet établissement spécial : terre cuite, table mexicaine, jus frais et antojitos préparés pour être partagés.',
            'RESERVA Y VISÍTANOS': 'RÉSERVEZ ET VISITEZ-NOUS',
            'Ven a disfrutar La Querendona Sahagún': 'Venez profiter de La Querendona Sahagún',
            'Mantuvimos el mismo menú de navegación para que puedas explorar platillos, conocer al equipo o hacer una reservación desde cualquier sección.': 'Nous avons conservé le même menu de navigation pour que vous puissiez explorer les plats, rencontrer l’équipe ou faire une réservation depuis n’importe quelle section.',
            'Comida tradicional': 'Cuisine traditionnelle',
            'Platillos preparados con recetas auténticas y sabor casero.': 'Des plats préparés avec des recettes authentiques et des saveurs maison.',
            'Eventos y reuniones': 'Événements et réunions',
            'Espacios ideales para convivencias familiares y celebraciones.': 'Des espaces idéaux pour les réunions familiales et les célébrations.',
            'Servicio rápido': 'Service rapide',
            'Atención rápida y ambiente cómodo para disfrutar sin prisas.': 'Un service rapide et une ambiance confortable pour profiter sans se presser.',
            'Especialidades': 'Spécialités',
            'Sobre nosotros': 'À propos',
            'La Querendona es un restaurante pensado para compartir buenos momentos, disfrutar comida deliciosa y mantener viva la esencia de la cocina mexicana.': 'La Querendona est un restaurant conçu pour partager de bons moments, savourer une cuisine délicieuse et préserver l’essence de la cuisine mexicaine.',
            'La Querendona Sahagún es un restaurante pensado para compartir buenos momentos, disfrutar comida deliciosa y mantener viva la esencia de la cocina mexicana.': 'La Querendona Sahagún est un restaurant conçu pour partager de bons moments, savourer une cuisine délicieuse et préserver l’essence de la cuisine mexicaine.',
            'Nuestro objetivo es brindar un ambiente cálido, familiar y lleno de sabor.': 'Notre objectif est d’offrir une ambiance chaleureuse, familiale et pleine de saveurs.',
            'Conócenos →': 'Découvrez-nous →',
            'Sabor tradicional mexicano': 'Saveur traditionnelle mexicaine',
            '¡¡ DESCUBRE NUESTRO MENÚ !!': 'DÉCOUVREZ NOTRE MENU !',
            'Descubre nuestros platillos preparados con ingredientes frescos,tradición y el auténtico sabor de La Querendona.': 'Découvrez nos plats préparés avec des ingrédients frais, la tradition et la saveur authentique de La Querendona.',
            'Explorar menú': 'Explorer le menu',
            'RECOMENDACIÓN': 'RECOMMANDATION',
            'Platillo especial del chef': 'Spécialité du chef',
            'Preparado diariamente con ingredientes frescos y recetas tradicionales.': 'Préparé chaque jour avec des ingrédients frais et des recettes traditionnelles.',
            'Quesabirria preparada con tortilla dorada, queso fundido y carne jugosa cocinada lentamente. Se acompaña con consomé caliente, cebolla, cilantro y limón para disfrutar cada bocado con el sabor casero que distingue a La Querendona.': 'Quesabirria préparée avec une tortilla dorée, du fromage fondu et une viande juteuse mijotée lentement. Servie avec du consommé chaud, de l’oignon, de la coriandre et du citron vert pour savourer chaque bouchée avec la saveur maison de La Querendona.',
            'NUESTRO MENÚ': 'NOTRE MENU',
            '❤️😋 SABORES QUE ENAMORAN 😋❤️': '❤️😋 DES SAVEURS QUI FONT RÊVER 😋❤️',
            'Descubre nuestros platillos tradicionales, preparados con ingredientes frescos y auténticos.': 'Découvrez nos plats traditionnels, préparés avec des ingrédients frais et authentiques.',
            'Descargar menú PDF': 'Télécharger le menu PDF',
            'Nuestra historia': 'Notre histoire',
            'Tradición, sabor y familia': 'Tradition, saveur et famille',
            'En La Querendona compartimos la riqueza de la cocina tradicional mexicana con calidad, hospitalidad y sabor casero.': 'À La Querendona, nous partageons la richesse de la cuisine mexicaine traditionnelle avec qualité, hospitalité et saveurs maison.',
            'NUESTRA ESENCIA': 'NOTRE ESSENCE',
            'Un restaurante hecho con pasión mexicana': 'Un restaurant créé avec la passion mexicaine',
            'La Querendona fue fundada en 2021 bajo la inspiración del Sr. Horacio Molina Silva, con la visión de crear un espacio especializado en comida típica mexicana.': 'La Querendona a été fondée en 2021, inspirée par M. Horacio Molina Silva et sa vision de créer un lieu consacré à la cuisine mexicaine traditionnelle.',
            'Nuestra primera sucursal abrió en Ciudad Sahagún, Hidalgo, y posteriormente llegó la sucursal de Tepeapulco, conservando el estilo mexicano, el menú, la coctelería y el sazón casero que nos distingue.': 'Notre premier établissement a ouvert à Ciudad Sahagún, Hidalgo, puis à Tepeapulco, en conservant le style mexicain, le menu, les cocktails et les saveurs maison qui nous distinguent.',
            'Hoy seguimos creciendo con el mismo propósito: ofrecer platillos inspirados en la gastronomía mexicana y una experiencia cálida, familiar y relajada.': 'Aujourd’hui, nous continuons à grandir avec le même objectif : proposer des plats inspirés de la gastronomie mexicaine dans une ambiance chaleureuse, familiale et détendue.',
            'FILOSOFÍA INSTITUCIONAL': 'NOTRE PHILOSOPHIE',
            'Nuestra forma de servir': 'Notre façon de servir',
            'Trabajamos con identidad, pasión y compromiso para preservar los sabores tradicionales de México y brindar a cada comensal una experiencia de calidad.': 'Nous travaillons avec identité, passion et engagement pour préserver les saveurs traditionnelles du Mexique et offrir à chaque convive une expérience de qualité.',
            'MISIÓN': 'MISSION',
            'Resaltar la cocina tradicional mexicana': 'Mettre en valeur la cuisine mexicaine traditionnelle',
            'Somos un restaurante que busca ofrecer una experiencia culinaria que celebre la riqueza de la cocina tradicional mexicana, cuidando la técnica, el arte en la preparación y cada detalle del servicio.': 'Nous sommes un restaurant qui propose une expérience culinaire célébrant la richesse de la cuisine mexicaine traditionnelle, avec une attention portée à la technique, à la préparation et à chaque détail du service.',
            'VISIÓN': 'VISION',
            'Ser un referente gastronómico': 'Devenir une référence gastronomique',
            'Aspiramos a consolidarnos como un referente de la gastronomía tradicional mexicana, preservando sus sabores y tradiciones con autenticidad, calidad y confianza.': 'Nous aspirons à devenir une référence de la gastronomie mexicaine traditionnelle en préservant ses saveurs et ses traditions avec authenticité, qualité et confiance.',
            'OBJETIVO GENERAL': 'OBJECTIF GÉNÉRAL',
            'Fortalecer nuestra presencia en la región mediante un crecimiento estratégico, manteniendo la calidad de nuestros productos, el reconocimiento de marca y una experiencia que haga sentir a cada cliente cobijado por la esencia de México.': 'Renforcer notre présence dans la région grâce à une croissance stratégique, tout en maintenant la qualité de nos produits, la reconnaissance de la marque et une expérience empreinte de l’essence du Mexique.',
            'Lo que nos representa': 'Ce qui nous représente',
            'Autenticidad': 'Authenticité',
            'Preservamos la esencia culinaria de la cocina tradicional mexicana en cada platillo.': 'Nous préservons l’essence culinaire de la cuisine mexicaine traditionnelle dans chaque plat.',
            'Pasión': 'Passion',
            'Compartimos con clientes y colaboradores la inspiración por la gastronomía y las tradiciones mexicanas.': 'Nous partageons avec nos clients et notre équipe notre passion pour la gastronomie et les traditions mexicaines.',
            'Calidad': 'Qualité',
            'Buscamos distinción y excelencia en nuestros productos, procesos y servicio.': 'Nous recherchons la distinction et l’excellence dans nos produits, nos processus et notre service.',
            'Hospitalidad': 'Hospitalité',
            'Brindamos una experiencia acogedora para que cada cliente se sienta cobijado por la esencia de México.': 'Nous offrons une expérience accueillante afin que chaque client se sente enveloppé par l’essence du Mexique.',
            'Respeto': 'Respect',
            'Promovemos un ambiente cordial donde se honra la diversidad, se cuidan nuestras tradiciones y se ofrece un trato justo.': 'Nous favorisons une ambiance conviviale qui respecte la diversité, protège nos traditions et offre un traitement équitable.',
            'Tradición': 'Tradition',
            'Conservamos los sabores, costumbres y recetas que dan identidad a la gastronomía mexicana.': 'Nous préservons les saveurs, les coutumes et les recettes qui donnent son identité à la gastronomie mexicaine.',
            'EXPERIENCIA': 'EXPÉRIENCE',
            'Mucho más que un restaurante': 'Bien plus qu’un restaurant',
            'Queremos que cada visita se convierta en una experiencia memorable llena de sabor, comodidad y tradición.': 'Nous souhaitons que chaque visite devienne une expérience mémorable, pleine de saveurs, de confort et de tradition.',
            'Talento y tradición mexicana': 'Talent et tradition mexicaine',
            'CONOCE A': 'DÉCOUVREZ',
            'Nuestro Equipo': 'Notre équipe',
            'Detrás de cada platillo existe pasión, creatividad y tradición mexicana. Nuestro equipo culinario transforma ingredientes frescos en experiencias inolvidables.': 'Derrière chaque plat se trouvent la passion, la créativité et la tradition mexicaine. Notre équipe transforme des ingrédients frais en expériences inoubliables.',
            'NUESTROS CHEFS': 'NOS CHEFS',
            'Detrás de cada platillo hay técnica, pasión y dedicación. Nuestro equipo de cocina cuida cada detalle para servir sabores auténticos y momentos memorables.': 'Derrière chaque plat se trouvent la technique, la passion et le dévouement. Notre équipe de cuisine soigne chaque détail pour servir des saveurs authentiques et des moments mémorables.',
            'NUESTROS MESEROS': 'NOTRE SERVICE',
            'Nuestro personal de servicio acompaña cada visita con atención cercana, calidez y cuidado en cada detalle para que todos se sientan como en casa.': 'Notre équipe de service accompagne chaque visite avec attention, chaleur et soin dans chaque détail afin que chacun se sente comme à la maison.',
            'ATENCIÓN EN MESA': 'SERVICE À TABLE',
            'Mesera Alejandra': 'Serveuse Alejandra',
            'Brinda una atención amable y atenta, cuidando que cada mesa tenga una experiencia cómoda desde la bienvenida hasta la despedida.': 'Elle offre un service aimable et attentif, en veillant à ce que chaque table vive une expérience agréable de l’accueil au départ.',
            'Servicio': 'Service',
            'Calidez': 'Chaleur',
            'Detalle': 'Détail',
            'SERVICIO AL CLIENTE': 'SERVICE CLIENT',
            'Mesero Jovani': 'Serveur Jovani',
            'Acompaña a los clientes con trato cordial, rapidez y buena disposición para que disfruten cada momento en La Querendona.': 'Il accompagne les clients avec cordialité, rapidité et bonne disposition afin qu’ils profitent de chaque moment à La Querendona.',
            'Rapidez': 'Rapidité',
            'Atención': 'Attention',
            'Cordialidad': 'Cordialité',
            'HOSPITALIDAD': 'HOSPITALITÉ',
            'Mesero Paco': 'Serveur Paco',
            'Comparte la esencia familiar del restaurante con una atención respetuosa, cercana y lista para hacer sentir bienvenido a cada comensal.': 'Il partage l’esprit familial du restaurant avec un service respectueux, chaleureux et prêt à accueillir chaque convive.',
            'Hospitalidad': 'Hospitalité',
            'Amabilidad': 'Amabilité',
            'Confianza': 'Confiance',
            'CHEF PRINCIPAL': 'CHEF PRINCIPAL',
            'Especialista en cocina mexicana tradicional y parrilla. Su pasión es conservar los sabores auténticos que representan la esencia de La Querendona.': 'Spécialiste de la cuisine mexicaine traditionnelle et des grillades. Sa passion est de préserver les saveurs authentiques qui représentent l’essence de La Querendona.',
            'Parrilla': 'Grillades',
            'Molcajetes': 'Molcajetes',
            'SABORES & EXPERIENCIAS': 'SAVEURS & EXPÉRIENCES',
            'Encargada de crear experiencias cálidas y modernas combinando recetas caseras con una presentación elegante y auténtica.': 'Elle crée des expériences chaleureuses et modernes en associant des recettes maison à une présentation élégante et authentique.',
            'Bebidas': 'Boissons',
            'Postres': 'Desserts',
            '“La cocina mexicana no solo se sirve, se comparte con el corazón.”': '« La cuisine mexicaine ne se sert pas seulement, elle se partage avec le cœur. »',
            'CONTÁCTANOS': 'CONTACTEZ-NOUS',
            'Reserva y vive la experiencia': 'Réservez et vivez l’expérience',
            'Estamos listos para recibirte en La Querendona. Disfruta de nuestros sabores tradicionales en un ambiente cálido y familiar.': 'Nous sommes prêts à vous accueillir à La Querendona. Profitez de nos saveurs traditionnelles dans une ambiance chaleureuse et familiale.',
            'Información': 'Informations',
            'Ubicación': 'Adresse',
            'Ubicaciones': 'Adresses',
            'Tepeapulco': 'Tepeapulco',
            'Ciudad Sahagún': 'Ciudad Sahagún',
            'Horario': 'Horaires',
            'Lunes a Domingo': 'Du lundi au dimanche',
            'Haz una reservación': 'Faire une réservation',
            'No. de cliente': 'N° de client',
            'Elija la Sucursal de su agrado': 'Choisissez l’établissement de votre choix',
            'Tepeapulco, Hidalgo': 'Tepeapulco, Hidalgo',
            'Ciudad Sahagún, Hidalgo': 'Ciudad Sahagún, Hidalgo',
            'Nombre completo': 'Nom complet',
            'Correo electrónico': 'Adresse e-mail',
            'Número telefónico': 'Numéro de téléphone',
            'Número de personas': 'Nombre de personnes',
            'Hora de la reserva': 'Heure de la réservation',
            'Selecciona la hora': 'Choisissez une heure',
            'Tipo de celebración': 'Type de célébration',
            'Sin celebración especial': 'Aucune célébration particulière',
            'Cumpleaños': 'Anniversaire',
            'Aniversario': 'Anniversaire de mariage',
            'Reunión familiar': 'Réunion de famille',
            'Reunión de amigos': 'Réunion entre amis',
            'Graduación': 'Remise de diplôme',
            'Evento empresarial': 'Événement d’entreprise',
            'Otro': 'Autre',
            'Mensaje o detalles adicionales': 'Message ou détails supplémentaires',
            'Reservar ahora': 'Réserver maintenant',
            'Encuéntranos': 'Nous trouver',
            'Síguenos': 'Suivez-nous',
            'Todos los derechos reservados': 'Tous droits réservés',
            'Sabor, tradición y familia en Tepeapulco.': 'Saveur, tradition et famille à Tepeapulco.',
            'Sabor, tradición y familia en Sahagún.': 'Saveur, tradition et famille à Sahagún.',
            'Enlaces rápidos': 'Liens rapides',
            'CONTACTO': 'CONTACT',
            'Visítanos': 'Rendez-nous visite',
            'Av. Juárez, Centro, Tepeapulco, Hgo.': 'Av. Juarez, Centro, Tepeapulco, Hgo.',
            'Ciudad Sahagún, Hidalgo.': 'Ciudad Sahagún, Hidalgo.',
            'Carr. Pachuca - Cd. Sahagún Manzana #1-Lote 10, Vicente Guerrero, 43998 Cd Sahagún, Hgo.': 'Carr. Pachuca - Cd. Sahagún Manzana #1-Lote 10, Vicente Guerrero, 43998 Cd Sahagún, Hgo.',
            'Lunes a Domingo · 9:00 AM - 9:00 PM': 'Lundi à dimanche · 9:00 AM - 9:00 PM',
            'Reservaciones': 'Réservations',
            'WhatsApp +52 775 105 1325': 'WhatsApp +52 775 105 1325',
            '© 2026 La Querendona. Todos los derechos reservados.': '© 2026 La Querendona. Tous droits réservés.',
            'Sitio oficial de La Querendona Tepeapulco.': 'Site officiel de La Querendona Tepeapulco.',
            'Sitio oficial de La Querendona Sahagún.': 'Site officiel de La Querendona Sahagún.',
            '© 2026 Todos los derechos reservados': '© 2026 Tous droits réservés',
            'Activar sonido': 'Activer le son',
            'Silenciar video': 'Couper le son',
            'Añadido': 'Ajouté',
            'Añadido correctamente': 'Ajouté avec succès',
            'Hola, quiero hacer una reservación en La Querendona.': 'Bonjour, je souhaite faire une réservation à La Querendona.',
            'Nombre': 'Nom',
            'Correo': 'E-mail',
            'Teléfono': 'Téléphone',
            'Personas': 'Personnes',
            'Sucursal': 'Établissement',
            'Fecha': 'Date',
            'Hora': 'Heure',
            'Detalles': 'Détails',
            'Sin detalles adicionales': 'Aucun détail supplémentaire',
            '¿Me pueden confirmar disponibilidad?': 'Pouvez-vous me confirmer les disponibilités ?',
            'Te llevamos a WhatsApp para confirmar tu reservación.': 'Nous vous redirigeons vers WhatsApp pour confirmer votre réservation.',
            'Guardando reservación...': 'Enregistrement de la réservation...',
            'Reservación registrada. Te llevamos a WhatsApp para confirmar.': 'Réservation enregistrée. Nous vous redirigeons vers WhatsApp pour confirmer.',
            'No pudimos registrar tu reservación. Inténtalo de nuevo o contáctanos por WhatsApp.': 'Nous n’avons pas pu enregistrer votre réservation. Réessayez ou contactez-nous sur WhatsApp.',
            'La Querendona | Restaurante en Tepeapulco': 'La Querendona | Restaurant à Tepeapulco',
            'La Querendona | Restaurante en Sahagún': 'La Querendona | Restaurant à Sahagún',
            'La Querendona | Menú': 'La Querendona | Menu',
            'La Querendona | Contacto': 'La Querendona | Contact',
            'Seleccionar Restaurante - La Querendona': 'Choisir un restaurant - La Querendona'
        }
    };

    function normalize(value) {
        return String(value || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getLanguage() {
        const savedLanguage = localStorage.getItem(STORAGE_KEY);
        return SUPPORTED_LANGUAGES.includes(savedLanguage) ? savedLanguage : 'es';
    }

    function translate(text, language = getLanguage()) {
        const normalizedText = normalize(text);

        if(language === 'es' || !normalizedText){
            return normalizedText;
        }

        return translations[language]?.[normalizedText] || normalizedText;
    }

    function rememberTextNodes() {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

        while(walker.nextNode()){
            const node = walker.currentNode;
            const parentTag = node.parentElement?.tagName;

            if(!parentTag || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parentTag)){
                continue;
            }

            if(normalize(node.nodeValue) && !originalTextNodes.has(node)){
                originalTextNodes.set(node, node.nodeValue);
            }
        }
    }

    function rememberAttributes() {
        document.querySelectorAll('[placeholder], [aria-label], [title], [alt]').forEach((element) => {
            if(originalAttributes.has(element)){
                return;
            }

            originalAttributes.set(element, {
                placeholder: element.getAttribute('placeholder'),
                ariaLabel: element.getAttribute('aria-label'),
                title: element.getAttribute('title'),
                alt: element.getAttribute('alt')
            });
        });
    }

    function translateTextNodes(language) {
        rememberTextNodes();

        document.querySelectorAll('body *').forEach((element) => {
            element.childNodes.forEach((node) => {
                if(node.nodeType !== Node.TEXT_NODE || !originalTextNodes.has(node)){
                    return;
                }

                const originalValue = originalTextNodes.get(node);
                const normalizedOriginal = normalize(originalValue);

                if(language === 'es'){
                    node.nodeValue = originalValue;
                    return;
                }

                const translatedValue = translations[language]?.[normalizedOriginal];

                if(!translatedValue){
                    node.nodeValue = originalValue;
                    return;
                }

                const leadingWhitespace = originalValue.match(/^\s*/)?.[0] || '';
                const trailingWhitespace = originalValue.match(/\s*$/)?.[0] || '';
                node.nodeValue = `${leadingWhitespace}${translatedValue}${trailingWhitespace}`;
            });
        });
    }

    function translateAttributes(language) {
        rememberAttributes();

        document.querySelectorAll('[placeholder], [aria-label], [title], [alt]').forEach((element) => {
            const originals = originalAttributes.get(element);

            if(!originals){
                return;
            }

            [
                ['placeholder', originals.placeholder],
                ['aria-label', originals.ariaLabel],
                ['title', originals.title],
                ['alt', originals.alt]
            ].forEach(([attribute, originalValue]) => {
                if(originalValue === null){
                    return;
                }

                const translatedValue = language === 'es'
                    ? originalValue
                    : translations[language]?.[normalize(originalValue)] || originalValue;

                element.setAttribute(attribute, translatedValue);
            });
        });
    }

    function applyLanguage(language) {
        const selectedLanguage = SUPPORTED_LANGUAGES.includes(language) ? language : 'es';
        const originalTitle = document.documentElement.dataset.originalTitle || document.title;

        document.documentElement.dataset.originalTitle = originalTitle;
        document.documentElement.lang = selectedLanguage;
        document.title = selectedLanguage === 'es'
            ? originalTitle
            : translations[selectedLanguage]?.[normalize(originalTitle)] || originalTitle;

        translateTextNodes(selectedLanguage);
        translateAttributes(selectedLanguage);

        const languageSelect = document.getElementById('lang-select');

        if(languageSelect){
            languageSelect.value = selectedLanguage;
        }

        document.dispatchEvent(new CustomEvent('laquerendona:languagechange', {
            detail: { language: selectedLanguage }
        }));
    }

    function init() {
        const languageSelect = document.getElementById('lang-select');

        rememberTextNodes();
        rememberAttributes();
        applyLanguage(getLanguage());

        if(languageSelect){
            languageSelect.addEventListener('change', (event) => {
                const language = event.target.value;
                localStorage.setItem(STORAGE_KEY, language);
                applyLanguage(language);
            });
        }
    }

    window.LaQuerendonaI18n = {
        applyLanguage,
        getLanguage,
        init,
        t: translate
    };

    init();
})();
