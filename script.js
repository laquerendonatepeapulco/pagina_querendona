// ANIMACIÓN REVEAL AL HACER SCROLL
function translateSiteText(text){
    return window.LaQuerendonaI18n?.t(text) || text;
}

function getSiteLocale(){
    const language = window.LaQuerendonaI18n?.getLanguage() || 'es';

    return {
        es: 'es-MX',
        en: 'en-US',
        fr: 'fr-FR'
    }[language] || 'es-MX';
}

function markCurrentNavigation(){
    const currentPage =
        window.location.pathname.split('/').pop() || 'index.html';

    document.querySelectorAll('.navbar nav a[href]').forEach((link) => {
        const linkPage = link.getAttribute('href')?.split('/').pop()?.split('?')[0];
        const isCurrent = linkPage === currentPage;

        link.classList.toggle('active-nav', isCurrent);

        if(isCurrent){
            link.setAttribute('aria-current', 'page');
        }else{
            link.removeAttribute('aria-current');
        }
    });
}

markCurrentNavigation();

function getCurrentPageName(){
    return window.location.pathname.split('/').pop() || 'index.html';
}

function isSahagunContext(){
    const branch = new URLSearchParams(window.location.search).get('sucursal');

    return branch === 'sahagun' || getCurrentPageName() === 'sahagun.html';
}

function configureBranchLocation(){
    if(!isSahagunContext()){
        return;
    }

    const sahagunAddress = 'Carr. Pachuca - Cd. Sahagún Manzana #1-Lote 10, Vicente Guerrero, 43998 Cd Sahagún, Hgo.';
    const sahagunMap =
        'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15017.433823969914!2d-98.56828754751837!3d19.782393549327466!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x85d1b7fd291b7705%3A0xddb28d00b120566e!2sLa%20Querendona!5e0!3m2!1ses-419!2smx!4v1783104398718!5m2!1ses-419!2smx';
    const locationMap = document.getElementById('locationMap');
    const locationLink = document.getElementById('locationLink');
    const footerLocationText = document.getElementById('footerLocationText');
    const footerBrandText = document.querySelector('.footer-brand p');
    const footerOfficialText = document.querySelector('.footer-bottom p:last-child');
    const sahagunLinks = {
        'tepeapulco.html': 'sahagun.html',
        'menu.html': 'menu.html?sucursal=sahagun',
        'nosotros.html': 'nosotros.html?sucursal=sahagun',
        'chefs.html': 'chefs.html?sucursal=sahagun'
    };

    Object.entries(sahagunLinks).forEach(([originalHref, sahagunHref]) => {
        document.querySelectorAll(`a[href="${originalHref}"]`).forEach((link) => {
            link.setAttribute('href', sahagunHref);
        });
    });

    if(locationMap){
        locationMap.src = sahagunMap;
        locationMap.referrerPolicy = 'strict-origin-when-cross-origin';
    }

    if(locationLink){
        locationLink.href = 'https://www.google.com/maps/search/?api=1&query=Carr.%20Pachuca%20-%20Cd.%20Sahag%C3%BAn%20Manzana%20%231-Lote%2010%2C%20Vicente%20Guerrero%2C%2043998%20Cd%20Sahag%C3%BAn%2C%20Hgo.';
        locationLink.textContent = ` ${translateSiteText(sahagunAddress)}`;
    }

    if(footerLocationText){
        footerLocationText.textContent = translateSiteText(sahagunAddress);
    }

    if(footerBrandText){
        footerBrandText.textContent = translateSiteText('Sabor, tradición y familia en Sahagún.');
    }

    if(footerOfficialText){
        footerOfficialText.textContent = translateSiteText('Sitio oficial de La Querendona Sahagún.');
    }

    markCurrentNavigation();
}

function configureSahagunMenu(){
    if(!isSahagunContext()){
        return;
    }

    const gallery = document.querySelector('.menu-gallery');

    if(!gallery){
        return;
    }

    const menuImages = [
        'img/menu-sahagun/pagina1.jpg',
        'img/menu-sahagun/pagina2.jpg',
        'img/menu-sahagun/pagina3.jpg',
        'img/menu-sahagun/pagina4.jpg',
        'img/menu-sahagun/pagina5.jpg',
        'img/menu-sahagun/pagina6.jpg',
        'img/menu-sahagun/pagina7.jpg'
    ];

    const fragment = document.createDocumentFragment();

    menuImages.forEach((src, index) => {
        const card = document.createElement('div');
        const image = document.createElement('img');

        card.className = 'menu-image-card';
        image.src = src;
        image.alt = `Menú Sahagún ${index + 1}`;
        image.loading = 'lazy';
        image.decoding = 'async';

        card.appendChild(image);
        fragment.appendChild(card);
    });

    gallery.replaceChildren(fragment);
}

function configureSahagunTeam(){
    if(!isSahagunContext()){
        return;
    }

    const leadChefImage = document.getElementById('branchLeadChefImage');
    const leadChefName = document.getElementById('branchLeadChefName');
    const edithCard = document.getElementById('chefEdithCard');
    const servicePersonImage = document.getElementById('branchServicePersonImage');
    const servicePersonName = document.getElementById('branchServicePersonName');
    const servicePersonDescription = document.getElementById('branchServicePersonDescription');

    if(leadChefImage){
        leadChefImage.src = 'img/personal/margarita-vargas.png';
        leadChefImage.alt = 'Chef Margarita Vargas';
    }

    if(leadChefName){
        leadChefName.textContent = 'Chef Margarita Vargas';
    }

    if(servicePersonImage){
        servicePersonImage.src = 'img/personal/lizbeth.png';
        servicePersonImage.alt = 'Lizbeth';
    }

    if(servicePersonName){
        servicePersonName.textContent = 'Lizbeth';
    }

    if(servicePersonDescription){
        servicePersonDescription.textContent =
            'Recibe a cada cliente con una sonrisa y una atención cercana, procurando que cada visita sea cómoda y agradable. Su amabilidad, disposición y cuidado en los detalles ayudan a crear el ambiente cálido que distingue a La Querendona Sahagún.';
    }

    edithCard?.remove();
}

function initSahagunGalleryCarousel(){
    document.querySelectorAll('[data-gallery-carousel]').forEach((carousel) => {
        const track = carousel.querySelector('[data-gallery-track]');
        const slides = track ? Array.from(track.querySelectorAll('.sahagun-gallery-slide')) : [];
        const previousButton = carousel.querySelector('[data-gallery-prev]');
        const nextButton = carousel.querySelector('[data-gallery-next]');
        const dotsContainer = carousel.parentElement?.querySelector('[data-gallery-dots]');

        if(!track || slides.length === 0){
            return;
        }

        let activeIndex = 0;
        let scrollFrame = null;

        const dots = slides.map((slide, index) => {
            const button = document.createElement('button');

            button.type = 'button';
            button.className = 'sahagun-gallery-dot';
            button.setAttribute('aria-label', `Ver foto ${index + 1}`);

            button.addEventListener('click', () => {
                scrollToSlide(index);
            });

            return button;
        });

        if(dotsContainer){
            dotsContainer.replaceChildren(...dots);
        }

        const getCenteredSlideIndex = () => {
            const trackBox = track.getBoundingClientRect();
            const trackCenter = trackBox.left + trackBox.width / 2;

            return slides.reduce((closestIndex, slide, index) => {
                const slideBox = slide.getBoundingClientRect();
                const slideCenter = slideBox.left + slideBox.width / 2;
                const currentDistance = Math.abs(slideCenter - trackCenter);
                const closestBox = slides[closestIndex].getBoundingClientRect();
                const closestCenter = closestBox.left + closestBox.width / 2;
                const closestDistance = Math.abs(closestCenter - trackCenter);

                return currentDistance < closestDistance ? index : closestIndex;
            }, 0);
        };

        const updateCarouselState = () => {
            activeIndex = getCenteredSlideIndex();

            dots.forEach((dot, index) => {
                const isActive = index === activeIndex;

                dot.classList.toggle('is-active', isActive);
                dot.setAttribute('aria-current', isActive ? 'true' : 'false');
            });

            if(previousButton){
                previousButton.disabled = activeIndex === 0;
            }

            if(nextButton){
                nextButton.disabled = activeIndex === slides.length - 1;
            }
        };

        function scrollToSlide(index){
            const clampedIndex = Math.max(0, Math.min(index, slides.length - 1));
            const slide = slides[clampedIndex];
            const targetLeft =
                slide.offsetLeft -
                track.offsetLeft -
                (track.clientWidth - slide.clientWidth) / 2;

            track.scrollTo({
                left: targetLeft,
                behavior: 'smooth'
            });
        }

        previousButton?.addEventListener('click', () => {
            scrollToSlide(activeIndex - 1);
        });

        nextButton?.addEventListener('click', () => {
            scrollToSlide(activeIndex + 1);
        });

        track.addEventListener('keydown', (event) => {
            if(event.key === 'ArrowLeft'){
                event.preventDefault();
                scrollToSlide(activeIndex - 1);
            }

            if(event.key === 'ArrowRight'){
                event.preventDefault();
                scrollToSlide(activeIndex + 1);
            }
        });

        track.addEventListener('scroll', () => {
            if(scrollFrame){
                window.cancelAnimationFrame(scrollFrame);
            }

            scrollFrame = window.requestAnimationFrame(updateCarouselState);
        }, { passive: true });

        window.addEventListener('resize', updateCarouselState);
        updateCarouselState();
    });
}

function initTepeServiceCarousels(){
    document.querySelectorAll('[data-service-carousel]').forEach((carousel) => {
        const track = carousel.querySelector('[data-service-track]');
        const slides = track ? Array.from(track.querySelectorAll('img')) : [];
        const previousButton = carousel.querySelector('[data-service-prev]');
        const nextButton = carousel.querySelector('[data-service-next]');

        if(!track || slides.length === 0){
            return;
        }

        let activeIndex = 0;
        let scrollFrame = null;

        const getActiveIndex = () => {
            if(track.clientWidth === 0){
                return 0;
            }

            return Math.max(0, Math.min(
                slides.length - 1,
                Math.round(track.scrollLeft / track.clientWidth)
            ));
        };

        const updateState = () => {
            activeIndex = getActiveIndex();

            if(previousButton){
                previousButton.disabled = activeIndex === 0;
            }

            if(nextButton){
                nextButton.disabled = activeIndex === slides.length - 1;
            }
        };

        const scrollToSlide = (index) => {
            const clampedIndex = Math.max(0, Math.min(index, slides.length - 1));

            track.scrollTo({
                left: clampedIndex * track.clientWidth,
                behavior: 'smooth'
            });
        };

        previousButton?.addEventListener('click', () => {
            scrollToSlide(activeIndex - 1);
        });

        nextButton?.addEventListener('click', () => {
            scrollToSlide(activeIndex + 1);
        });

        track.addEventListener('keydown', (event) => {
            if(event.key === 'ArrowLeft'){
                event.preventDefault();
                scrollToSlide(activeIndex - 1);
            }

            if(event.key === 'ArrowRight'){
                event.preventDefault();
                scrollToSlide(activeIndex + 1);
            }
        });

        track.addEventListener('scroll', () => {
            if(scrollFrame){
                window.cancelAnimationFrame(scrollFrame);
            }

            scrollFrame = window.requestAnimationFrame(updateState);
        }, { passive: true });

        window.addEventListener('resize', updateState);
        updateState();
    });
}

configureBranchLocation();
configureSahagunMenu();
configureSahagunTeam();
initSahagunGalleryCarousel();
initTepeServiceCarousels();
document.addEventListener('laquerendona:languagechange', configureBranchLocation);

document.addEventListener('laquerendona:languagechange', () => {
    document.querySelectorAll('.sound-btn').forEach((button) => {
        const container = button.closest(
            '.hero-video-container, .experience-video-container, .chefs-hero-video-container'
        );
        const video = container ? container.querySelector('video') : null;
        const label = video && !video.muted ? 'Silenciar video' : 'Activar sonido';

        button.setAttribute('aria-label', translateSiteText(label));
    });
});

const reveals = document.querySelectorAll('.reveal');

function revealOnScroll(){

    reveals.forEach((element)=>{

        const windowHeight = window.innerHeight;

        const revealTop = element.getBoundingClientRect().top;

        if(revealTop < windowHeight - 100){

            element.classList.add('active');

        }

    });

}

window.addEventListener('scroll', revealOnScroll);
revealOnScroll();
// EFECTO PARALLAX SUAVE
const useParallax =
    !window.matchMedia('(max-width: 768px)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if(useParallax){
window.addEventListener('scroll', () => {
    const scrolled = window.scrollY;
    document.querySelectorAll('.floating').forEach(el => {
        el.style.transform = `translateY(${scrolled * 0.03}px)`;
    });
});
}
// EFECTO HOVER DINÁMICO EN CARDS
const cards = document.querySelectorAll('.card');
cards.forEach(card => {
card.addEventListener('mousemove', (e) => {
const rect = card.getBoundingClientRect();
const x = e.clientX - rect.left;
const y = e.clientY - rect.top;
card.style.background = `radial-gradient(circle at ${x}px ${y}px,
rgba(255,255,255,1), rgba(255,255,255,0.95))`;
});
card.addEventListener('mouseleave', () => {
card.style.background = 'white';
});

});


const themeToggle = document.getElementById('themeToggle');
if(themeToggle){
themeToggle.addEventListener('click', () => {

document.body.classList.toggle('dark-mode');
if(document.body.classList.contains('dark-mode')) {
themeToggle.innerHTML = ' ';
} else {
themeToggle.innerHTML = ' ';
}
});
}

// FILTROS DEL MENÚ
const filterBtns = document.querySelectorAll('.filter-btn');
const menuItems = document.querySelectorAll('.menu-item-card');
filterBtns.forEach(btn => {
btn.addEventListener('click', () => {
filterBtns.forEach(b => b.classList.remove('active'));
btn.classList.add('active');
const filterValue = btn.getAttribute('data-filter');
menuItems.forEach(item => {
if(filterValue === 'all' || item.dataset.category === filterValue){
item.classList.remove('hidden');
} else {
item.classList.add('hidden');
}
});
});
});
// TOAST DE ORDEN
function showToast(message) {

let toast = document.getElementById('toast');

if(!toast){
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
}

toast.innerText = message;
toast.classList.add('show');
setTimeout(() => {
toast.classList.remove('show');
}, 3000);

}

function addToOrder(itemName) {

showToast(`${translateSiteText('Añadido')}: ${itemName} `);
}
// SCROLL SUAVE
function scrollToMenu() {
const menuSection = document.getElementById('menu-section');
if(menuSection){
menuSection.scrollIntoView({
behavior: 'smooth'
});
}
}

/* ========================= */
/* RESERVACIÓN */
/* ========================= */

const RESERVATION_COUNTER_KEY = 'querendonaReservationCounter';
const reservationForm = document.getElementById('reservationForm');

if(reservationForm){

    const reservationDate = reservationForm.querySelector('input[name="date"]');
    const customerNumberInput = reservationForm.querySelector('input[name="customerNumber"]');

    if(reservationDate){
        setDefaultReservationDate(reservationDate);
        const dateField = reservationDate.closest('.date-field');

        if(dateField){
            dateField.addEventListener('click', () => openReservationDatePicker(reservationDate));
        }

        reservationDate.addEventListener('change', () => {
            if(customerNumberInput){
                setReservationCustomerNumber(customerNumberInput, reservationDate.value);
            }
        });
    }

    if(customerNumberInput){
        setReservationCustomerNumber(customerNumberInput, reservationDate ? reservationDate.value : undefined);
    }

    reservationForm.addEventListener('submit', async (e) => {

        e.preventDefault();

        const submitButton = reservationForm.querySelector('button[type="submit"]');
        const originalButtonText = submitButton ? submitButton.textContent.trim() : '';
        const formData = new FormData(reservationForm);

        const reservationPayload = {
            branch: String(formData.get('branch') || '').trim(),
            name: String(formData.get('name') || '').trim(),
            email: String(formData.get('email') || '').trim(),
            phone: String(formData.get('phone') || '').trim(),
            date: String(formData.get('date') || ''),
            time: String(formData.get('time') || ''),
            celebrationType: String(formData.get('celebrationType') || '').trim(),
            message: String(formData.get('message') || '').trim()
        };

        if(submitButton){
            submitButton.disabled = true;
            submitButton.textContent = translateSiteText('Guardando reservación...');
        }

        try {
            const response = await fetch('/api/reservations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(reservationPayload)
            });
            const payload = await readJsonResponse(response);

            if(!response.ok){
                throw new Error(payload.error || translateSiteText('No pudimos registrar tu reservación. Inténtalo de nuevo o contáctanos por WhatsApp.'));
            }

            const savedReservation = payload.reservation || {};
            const customerNumber = savedReservation.customerNumber || String(formData.get('customerNumber') || '').trim();
            const reservationForWhatsApp = {
                ...reservationPayload,
                customerNumber,
                date: savedReservation.date || reservationPayload.date,
                time: savedReservation.time || reservationPayload.time
            };

            openReservationWhatsApp(reservationForWhatsApp);
            showToast(translateSiteText(payload.mode === 'whatsapp-only'
                ? 'Te llevamos a WhatsApp para confirmar tu reservación.'
                : 'Reservación registrada. Te llevamos a WhatsApp para confirmar.'));

            if(payload.mode !== 'whatsapp-only'){
                confirmReservationCustomerNumber(customerNumber);
            }
            reservationForm.reset();

            if(reservationDate){
                setDefaultReservationDate(reservationDate);
            }

            if(customerNumberInput){
                setReservationCustomerNumber(customerNumberInput, reservationDate ? reservationDate.value : undefined);
            }
        } catch (error) {
            showToast(error.message || translateSiteText('No pudimos registrar tu reservación. Inténtalo de nuevo o contáctanos por WhatsApp.'));
        } finally {
            if(submitButton){
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText || translateSiteText('Reservar ahora');
            }
        }

    });

}

async function readJsonResponse(response){

    try {
        return await response.json();
    } catch (error) {
        return {};
    }

}

function openReservationWhatsApp(reservation){

    const whatsappNumber = '527751051325';
    const whatsappUrl =
        `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(buildReservationMessage(reservation))}`;
    const whatsappWindow = window.open(whatsappUrl, '_blank', 'noopener');

    if(!whatsappWindow){
        window.location.href = whatsappUrl;
    }

}

function buildReservationMessage(reservation){

    const formattedDate = formatReservationDate(reservation.date);
    const formattedTime = formatReservationTime(reservation.time);

    return [
        translateSiteText('Hola, quiero hacer una reservación en La Querendona.'),
        '',
        `${translateSiteText('No. de cliente')}: ${reservation.customerNumber}`,
        `${translateSiteText('Nombre')}: ${reservation.name}`,
        `${translateSiteText('Correo')}: ${reservation.email}`,
        `${translateSiteText('Teléfono')}: ${reservation.phone}`,
        `${translateSiteText('Sucursal')}: ${translateSiteText(reservation.branch)}`,
        `${translateSiteText('Fecha')}: ${formattedDate}`,
        `${translateSiteText('Hora')}: ${formattedTime}`,
        `${translateSiteText('Tipo de celebración')}: ${translateSiteText(reservation.celebrationType)}`,
        `${translateSiteText('Detalles')}: ${reservation.message || translateSiteText('Sin detalles adicionales')}`,
        '',
        translateSiteText('¿Me pueden confirmar disponibilidad?')
    ].join('\n');

}

function setReservationCustomerNumber(input, dateValue){

    input.value = getNextReservationCustomerNumber(dateValue);

}

function getNextReservationCustomerNumber(dateValue){

    const reservationDate = isInputDate(dateValue) ? dateValue : getTodayInputDate();
    const counter = getReservationCounter(reservationDate);
    const nextNumber = counter.count + 1;

    return formatReservationCustomerNumber(reservationDate, nextNumber);

}

function confirmReservationCustomerNumber(customerNumber){

    const reservationDate = getReservationDateFromCustomerNumber(customerNumber);
    const sequence = getReservationSequence(customerNumber, reservationDate);

    if(!reservationDate || !sequence){
        return;
    }

    const counter = getReservationCounter(reservationDate);
    const nextCount = Math.max(counter.count, sequence);

    localStorage.setItem(RESERVATION_COUNTER_KEY, JSON.stringify({
        date: reservationDate,
        count: nextCount
    }));

}

function getReservationCounter(today){

    try {
        const counter = JSON.parse(localStorage.getItem(RESERVATION_COUNTER_KEY));

        if(counter && counter.date === today && Number.isInteger(counter.count)){
            return counter;
        }
    } catch (error) {
        localStorage.removeItem(RESERVATION_COUNTER_KEY);
    }

    return { date: today, count: 0 };

}

function isInputDate(value){

    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

}

function getReservationDateFromCustomerNumber(customerNumber){

    const match = String(customerNumber || '').match(/^CL-(\d{4})(\d{2})(\d{2})-\d+$/);

    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';

}

function getReservationSequence(customerNumber, today){

    const compactDate = today.replaceAll('-', '');
    const match = String(customerNumber || '').match(new RegExp(`^CL-${compactDate}-(\\d+)$`));

    return match ? Number(match[1]) : 0;

}

function formatReservationCustomerNumber(date, sequence){

    const compactDate = date.replaceAll('-', '');
    const paddedSequence = String(sequence).padStart(3, '0');

    return `CL-${compactDate}-${paddedSequence}`;

}

function formatReservationDate(value){

    if(!value){
        return '';
    }

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    return date.toLocaleDateString(getSiteLocale(), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

}

function setDefaultReservationDate(input){

    const today = getTodayInputDate();

    input.min = today;
    input.value = today;
    input.defaultValue = today;

}

function openReservationDatePicker(input){

    try {
        if(typeof input.showPicker === 'function'){
            input.showPicker();
            return;
        }
    } catch (error) {
        // El navegador puede bloquear showPicker si ya abrio el calendario nativo.
    }

    input.focus();

}

function getTodayInputDate(){

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;

}

function formatReservationTime(value){

    if(!value){
        return '';
    }

    const [hours, minutes] = value.split(':').map(Number);
    const date = new Date();

    date.setHours(hours, minutes, 0, 0);

    return date.toLocaleTimeString(getSiteLocale(), {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

}

/* ========================= */
/* 3D SERVICE CARDS */
/* ========================= */

const serviceCards = document.querySelectorAll('.service-card');

serviceCards.forEach((card)=>{

    card.addEventListener('mousemove', (e)=>{

        const rect = card.getBoundingClientRect();

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const rotateY = ((x / rect.width) - 0.5) * 14;
        const rotateX = ((y / rect.height) - 0.5) * -14;

        card.style.transform = `
            perspective(1000px)
            rotateX(${rotateX}deg)
            rotateY(${rotateY}deg)
            scale(1.03)
        `;

    });

    card.addEventListener('mouseleave', ()=>{

        card.style.transform = `
            perspective(1000px)
            rotateX(0)
            rotateY(0)
            scale(1)
        `;

    });

});

/* ========================= */
/* VIDEO SOUND */
/* ========================= */


window.addEventListener('DOMContentLoaded', ()=>{

    const soundButtons = document.querySelectorAll('.sound-btn');

    soundButtons.forEach((button)=>{

        const container = button.closest(
            '.hero-video-container, .experience-video-container, .chefs-hero-video-container'
        );

        const video = container ? container.querySelector('video') : null;

        if(!video){
            return;
        }

        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('preload', 'auto');

        button.setAttribute('type', 'button');
        button.setAttribute('aria-label', translateSiteText('Activar sonido'));

        button.addEventListener('click', async ()=>{

            button.disabled = true;

            try{

                if(video.muted){

                    video.muted = false;
                    video.defaultMuted = false;
                    video.volume = 1;

                    if(video.readyState < 2){
                        video.load();
                    }

                    await video.play();

                    button.innerHTML = '🔊';
                    button.setAttribute('aria-label', translateSiteText('Silenciar video'));

                }else{

                    video.muted = true;
                    video.defaultMuted = true;

                    await video.play().catch(()=>{});

                    button.innerHTML = '🔇';
                    button.setAttribute('aria-label', translateSiteText('Activar sonido'));
                }

            }catch(error){

                video.muted = false;
                video.defaultMuted = false;
                video.volume = 1;
                button.innerHTML = '🔊';
                button.setAttribute('aria-label', translateSiteText('Silenciar video'));

            }finally{

                button.disabled = false;
            }

        });

    });

});

/* ========================= */
/* AUTO CAROUSEL */
/* ========================= */

const track = document.getElementById('carouselTrack');

if(track){
    let position = 0;
    const isTouchCarousel = () =>
        window.matchMedia('(max-width: 768px), (hover: none) and (pointer: coarse)').matches;

    const resetCarouselPosition = () => {
        position = 0;
        track.style.transform = '';
    };

    setInterval(()=>{
        if(isTouchCarousel()){
            resetCarouselPosition();
            return;
        }

        const firstSlide = track.querySelector('.carousel-slide');
        const trackStyles = window.getComputedStyle(track);
        const slideGap = parseFloat(trackStyles.columnGap || trackStyles.gap) || 25;
        const slideWidth = firstSlide ? firstSlide.getBoundingClientRect().width + slideGap : 345;

        position -= slideWidth;

        if(Math.abs(position) >= track.scrollWidth - track.clientWidth){

            position = 0;
        }

        track.style.transform = `translateX(${position}px)`;

    }, 2500);

    window.addEventListener('resize', () => {
        if(isTouchCarousel()){
            resetCarouselPosition();
        }
    });
}

/* ========================= */
/* SLIDE RIGHT REVEAL */
/* ========================= */

const slideElements =
document.querySelectorAll('.slide-right');

const slideObserver =
new IntersectionObserver((entries)=>{

    entries.forEach((entry)=>{

        if(entry.isIntersecting){

            entry.target.classList.add('active');

        }

    });

},{
    threshold:0.2
});

slideElements.forEach((element)=>{

    slideObserver.observe(element);

});

/* ========================= */
/* REVEAL CHEFS */
/* ========================= */

const chefCards =
document.querySelectorAll('.reveal-chef');

const chefObserver =
new IntersectionObserver((entries)=>{

    entries.forEach((entry)=>{

        if(entry.isIntersecting){

            entry.target.classList.add('active');

        }

    });

},{
    threshold:0.2
});

chefCards.forEach((card)=>{

    chefObserver.observe(card);

});

/* ========================= */
/* MOBILE MENU */
/* ========================= */

const menuToggle =
document.getElementById('menuToggle');

const mobileMenu =
document.getElementById('mobileMenu');

if(menuToggle && mobileMenu){
menuToggle.addEventListener('click', ()=>{

    mobileMenu.classList.toggle('active');

    const isMenuOpen = mobileMenu.classList.contains('active');

    menuToggle.classList.toggle('active', isMenuOpen);

    if(isMenuOpen){

        menuToggle.innerHTML = '✕';

    }else{

        menuToggle.innerHTML = '☰';
    }

});

mobileMenu.querySelectorAll('a').forEach((link)=>{
    link.addEventListener('click', ()=>{
        mobileMenu.classList.remove('active');
        menuToggle.classList.remove('active');
        menuToggle.innerHTML = '☰';
    });
});
}
