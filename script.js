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
    }

    if(customerNumberInput){
        setReservationCustomerNumber(customerNumberInput);
    }

    reservationForm.addEventListener('submit', (e) => {

        e.preventDefault();

        const formData = new FormData(reservationForm);
        const customerNumber = String(formData.get('customerNumber') || '').trim();
        const name = String(formData.get('name') || '').trim();
        const email = String(formData.get('email') || '').trim();
        const phone = String(formData.get('phone') || '').trim();
        const date = String(formData.get('date') || '');
        const time = String(formData.get('time') || '');
        const celebrationType = String(formData.get('celebrationType') || '').trim();
        const message = String(formData.get('message') || '').trim();
        const formattedDate = formatReservationDate(date);
        const formattedTime = formatReservationTime(time);
        const whatsappNumber = '527713420990';
        const reservationMessage = [
            translateSiteText('Hola, quiero hacer una reservación en La Querendona.'),
            '',
            `${translateSiteText('No. de cliente')}: ${customerNumber}`,
            `${translateSiteText('Nombre')}: ${name}`,
            `${translateSiteText('Correo')}: ${email}`,
            `${translateSiteText('Teléfono')}: ${phone}`,
            `${translateSiteText('Fecha')}: ${formattedDate}`,
            `${translateSiteText('Hora')}: ${formattedTime}`,
            `${translateSiteText('Tipo de celebración')}: ${translateSiteText(celebrationType)}`,
            `${translateSiteText('Detalles')}: ${message || translateSiteText('Sin detalles adicionales')}`,
            '',
            translateSiteText('¿Me pueden confirmar disponibilidad?')
        ].join('\n');
        const whatsappUrl =
            `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(reservationMessage)}`;
        const whatsappWindow = window.open(whatsappUrl, '_blank', 'noopener');

        if(!whatsappWindow){
            window.location.href = whatsappUrl;
        }

        showToast(translateSiteText('Te llevamos a WhatsApp para confirmar tu reservación.'));

        confirmReservationCustomerNumber(customerNumber);
        reservationForm.reset();

        if(reservationDate){
            setDefaultReservationDate(reservationDate);
        }

        if(customerNumberInput){
            setReservationCustomerNumber(customerNumberInput);
        }

    });

}

function setReservationCustomerNumber(input){

    input.value = getNextReservationCustomerNumber();

}

function getNextReservationCustomerNumber(){

    const today = getTodayInputDate();
    const counter = getReservationCounter(today);
    const nextNumber = counter.count + 1;

    return formatReservationCustomerNumber(today, nextNumber);

}

function confirmReservationCustomerNumber(customerNumber){

    const today = getTodayInputDate();
    const sequence = getReservationSequence(customerNumber, today);

    if(!sequence){
        return;
    }

    const counter = getReservationCounter(today);
    const nextCount = Math.max(counter.count, sequence);

    localStorage.setItem(RESERVATION_COUNTER_KEY, JSON.stringify({
        date: today,
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
