import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = resolve(root, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const content = await readFile(path);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }).end(content);
  } catch { res.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch();
  for (const [width, height, theme] of [[390, 844, 'dark'], [1280, 900, 'light']]) {
    const page = await browser.newPage({ viewport: { width, height }, serviceWorkers: 'block' });
    await page.route('**/supabase-client.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
      window.signInRequests = 0;
      window.authRequests = [];
      window.WhoseDayBackend = {
        isEnabled: () => true, getSession: async () => null,
        signInWithEmail: (email, redirect, options) => {
          window.authRequests.push({email,redirect,options});
          window.signInRequests++;
          return new Promise((resolve, reject) => {
            window.finishSignIn = error => error ? reject(new Error(error)) : resolve();
          });
        }
      };` }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(theme => { setThemeMode(theme, false); showLoggedOutLogin(); }, theme);
    const login = page.locator('#ob-login-send');
    await page.waitForFunction(() => !document.getElementById('ob-login-send').disabled);
    await page.locator('#ob-login-email').fill('invalid');
    await login.click();
    assert.equal(await login.isEnabled(), true, 'Validation errors do not lock the button');
    assert.equal(await page.evaluate(() => signInRequests), 0);
    await page.locator('#ob-login-email').fill('test@example.com');
    const enabledColor = await login.evaluate(button => getComputedStyle(button).backgroundColor);
    await login.click();
    assert.equal(await login.isEnabled(), false);
    assert.equal(await login.innerText(), 'Sending...');
    assert.equal(await login.getAttribute('aria-busy'), 'true');
    assert.equal(await page.locator('#ob-login-message').innerText(), '', 'Clear stale validation errors while sending');
    assert.notEqual(await login.evaluate(button => getComputedStyle(button).backgroundColor), enabledColor);
    assert.equal(await login.evaluate(button => getComputedStyle(button).boxShadow), 'none');
    await page.evaluate(() => { sendLoggedOutSignInLink(); sendLoggedOutSignInLink(); });
    assert.equal(await page.evaluate(() => signInRequests), 1, 'Repeated taps cannot enqueue requests');
    await page.screenshot({ path: `/tmp/whose-day-signin-sending-${theme}.png` });
    await page.evaluate(() => finishSignIn('Network unavailable'));
    await page.waitForFunction(() => !document.getElementById('ob-login-send').disabled);
    assert.equal(await login.innerText(), 'Send sign-in link');
    assert.equal(await login.getAttribute('aria-busy'), null);
    await login.click();
    await page.evaluate(() => finishSignIn());
    await page.waitForFunction(() => document.getElementById('ob-login-send').textContent.startsWith('Try again in'));
    assert.equal(await login.isEnabled(), false, 'Success retains the existing resend cooldown');
    assert.equal(await page.evaluate(() => signInRequests), 2);
    await page.evaluate(() => sendLoggedOutSignInLink());
    assert.equal(await page.evaluate(() => signInRequests), 2);

    await page.evaluate(() => showSetup());
    const settings = page.locator('#cloud-auth-send');
    await page.waitForFunction(() => !document.getElementById('cloud-auth-send').disabled);
    await page.locator('#cloud-auth-email').fill('test@example.com');
    const settingsColor = await settings.evaluate(button => getComputedStyle(button).backgroundColor);
    await settings.click();
    assert.equal(await settings.isEnabled(), false);
    assert.equal(await settings.innerText(), 'Sending...');
    assert.equal(await settings.getAttribute('aria-busy'), 'true');
    assert.notEqual(await settings.evaluate(button => getComputedStyle(button).backgroundColor), settingsColor);
    await settings.screenshot({ path: `/tmp/whose-day-settings-sending-${theme}.png` });
    await page.evaluate(() => { sendCloudSignInLink(); sendCloudSignInLink(); });
    assert.equal(await page.evaluate(() => signInRequests), 3);
    await page.evaluate(() => finishSignIn('Network unavailable'));
    await page.waitForFunction(() => !document.getElementById('cloud-auth-send').disabled);
    assert.equal(await settings.innerText(), 'Send sign-in link');
    await settings.click();
    await page.evaluate(() => finishSignIn());
    await page.waitForFunction(() => !document.getElementById('cloud-auth-send').disabled);
    assert.equal(await settings.getAttribute('aria-busy'), null);
    assert.equal(await page.evaluate(() => signInRequests), 4);
    const loginCreatesUser=await page.evaluate(()=>authRequests[0].options.createUser);
    assert.equal(loginCreatesUser,false,'The login entry point only signs in existing accounts');
    await page.evaluate(()=>{localStorage.removeItem(LOGGED_OUT_SIGNIN_COOLDOWN_KEY);show('s-ob-welcome');});
    const signupButtons=page.locator('#s-ob-welcome button[onclick="showLoggedOutSignup()"]');
    assert.equal(await signupButtons.count(),3,'Header, hero, and closing Sign up buttons all reach signup');
    assert.equal(await page.locator('#s-ob-promises').count(),0,'The redundant marketing screen is removed');
    for(let i=0;i<3;i++){
      await signupButtons.nth(i).click();
      assert.equal(await page.locator('#s-ob-name').isVisible(),true);
      assert.equal(await page.locator('#s-ob-login').isVisible(),false,'Signup must not start with email login');
      assert.equal(await page.evaluate(()=>signInRequests),4,'Entering onboarding sends no auth email');
      await page.locator('#s-ob-name .ob-btn-back').click();
      assert.equal(await page.locator('#s-ob-welcome').isVisible(),true,'Back from the first question returns to the homepage');
    }
    await page.locator('#s-ob-welcome .landing-signin').click();
    await page.waitForFunction(()=>!loggedOutAuthBusy);
    assert.equal(await page.locator('#ob-auth-title').innerText(),'Sign in');
    await page.locator('#ob-auth-switch-signup button').click();
    assert.equal(await page.locator('#s-ob-name').isVisible(),true,'Signup asks for a name before email');
    await page.locator('#ob-name').fill('Jordan');
    await page.locator('#btn-ob-name').click();
    await page.locator('#ob-coparent').fill('Taylor');
    await page.locator('#s-ob-coparent .ob-btn-primary').click();
    await page.locator('.ob-kid-input').first().fill('Alex');
    await page.locator('#btn-ob-kids').click();
    assert.equal(await page.locator('#s-ob-finish').isVisible(),true,'Email belongs at the end of onboarding');
    assert.equal(await page.locator('#ob-name').inputValue(),'Jordan');
    assert.equal(await page.locator('.ob-kid-input').first().inputValue(),'Alex');
    await page.screenshot({path:`/tmp/whose-day-signup-final-${theme}.png`});
    await page.evaluate(()=>showLoggedOutLogin());
    await page.waitForFunction(()=>!loggedOutAuthBusy);
    await page.locator('#ob-login-email').fill('new@example.com');
    await login.click();
    await page.evaluate(()=>finishSignIn('Signups not allowed for otp'));
    await page.waitForFunction(()=>!loggedOutAuthBusy);
    assert.match(await page.locator('#ob-login-message').innerText(),/choose Sign up/);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Sign-in buttons passed: immediate disabled/gray/sending state, duplicate guards, validation, failure recovery, and success/cooldown in both views and themes.');
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, 'close');
}
