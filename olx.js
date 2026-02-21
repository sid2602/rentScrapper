require("dotenv").config();
const { chromium } = require("playwright");
const fs = require("fs");

const MAX_OFFERS_COUNT = 10;
const OFFERS_COUNT = 3;

// On Raspberry Pi set CHROMIUM_PATH=/usr/bin/chromium-browser; on Mac leave unset to use Playwright's browser
const chromiumPath = process.env.CHROMIUM_PATH;
const launchOptions = {
    headless: true,
    args: ["--no-sandbox"],
};
if (chromiumPath && fs.existsSync(chromiumPath)) {
    launchOptions.executablePath = chromiumPath;
}

const isOfferAlreadyScraped = async (offer) => {
    //Get only h4
    const title = await offer.locator('h4').first();
    const titleText = await title.innerText();

    console.log(titleText, ' check \n ');
    //Check api


    return false;
};

const getOfferDetailContentOtodom = async (browser, detailUrl) => {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'pl-PL',
        extraHTTPHeaders: {
            'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
        },
    });
    const detailPage = await context.newPage();
    detailPage.setDefaultTimeout(200000);
    await detailPage.goto(detailUrl, { waitUntil: "networkidle" });

    const mainContent = await detailPage.locator('[data-sentry-element="MainContent"]');
    const title = mainContent.locator('[data-cy="adPageAdTitle"]');
    const price = mainContent.locator('[aria-label="Cena"]');
    const mapLink = mainContent.locator('[data-sentry-component="MapLink"]');

    const titleText = await title.innerText();
    const priceText = await price.innerText();
    const mapText = await mapLink.innerText();

    const adDetails = mainContent.locator('[data-sentry-component="AdDetailsBase"]');
    const adDescription = mainContent.locator('[data-sentry-component="AdDescriptionBase"]');

    // Get their content when needed:
    const detailsText = await adDetails.innerText();
    const descriptionText = await adDescription.innerText();


    await detailPage.close();

    return {
        title: titleText,
        price: priceText,
        location: mapText,
        details: `${detailsText} \n\n\n ${descriptionText}`,
    };
};

const getOfferDetailContentOLX = async (browser, detailUrl) => {
    const detailPage = await browser.newPage();
    detailPage.setDefaultTimeout(200000);
    await detailPage.goto(detailUrl, { waitUntil: "domcontentloaded" });

    const header = await detailPage.getByTestId('ad-action-box');
    // const headerText = await header.innerText();

    const title = await header.locator('h4').first();
    const titleText = await title.innerText();

    const price = await header.locator('h3').first();
    const priceText = await price.innerText();

    const main = await detailPage.getByTestId('main');
    const mainText = await main.innerText();

    await detailPage.close();
    return { title: titleText, price: priceText, location: null, details: mainText };
};

(async () => {
    const browser = await chromium.launch(launchOptions);
    const page = await browser.newPage();
    page.setDefaultTimeout(200000);

    await page.goto(
        "https://www.olx.pl/nieruchomosci/mieszkania/wynajem/krakow/?search%5Border%5D=created_at:desc&search%5Bfilter_float_price:from%5D=2000&search%5Bfilter_float_price:to%5D=4000&search%5Bfilter_enum_rooms%5D%5B0%5D=three&search%5Bfilter_enum_rooms%5D%5B1%5D=four"
    );

    await page.getByRole('button', { name: 'Akceptuję' }).click();

    const container = await page.getByTestId('listing-grid');
    const offers = await container.getByTestId('l-card').all();

    for (let i = 0; i < MAX_OFFERS_COUNT; i++) {
        const offer = offers[i];
        const isScraped = await isOfferAlreadyScraped(offer);
        console.log("index", i)
        if (isScraped) {
            continue;
        }

        const offerLink = offer.locator("a").first();
        const href = await offerLink.getAttribute("href");
        if (!href) continue;
        const detailUrl = href.startsWith("http") ? href : new URL(href, page.url()).href;
        console.log(detailUrl);

        const detailContent = detailUrl.includes('otodom') ? await getOfferDetailContentOtodom(browser, detailUrl) : await getOfferDetailContentOLX(browser, detailUrl);
        console.log(detailContent);
    }

    await browser.close();
})();