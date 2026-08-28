import{test,expect}from'@playwright/test';

const credentials={email:process.env.POS_E2E_ADMIN_EMAIL,password:process.env.POS_E2E_ADMIN_PASSWORD};
async function login(page){await page.goto('/');await page.locator('#current-email').fill(credentials.email);await page.locator('#current-password').fill(credentials.password);await page.getByRole('button',{name:/sign in/i}).last().click();await expect(page.getByText(/admin/i).first()).toBeVisible({timeout:15_000});}

test('login form is keyboard accessible and localized',async({page})=>{await page.goto('/');await expect(page.locator('#current-email')).toHaveAttribute('autocomplete','username');await expect(page.locator('#current-password')).toHaveAttribute('autocomplete','current-password');await page.getByRole('button',{name:'zh'}).click();await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');await page.keyboard.press('Tab');});

test.describe('authenticated admin acceptance',()=>{test.skip(!credentials.email||!credentials.password,'Set POS_E2E_ADMIN_EMAIL and POS_E2E_ADMIN_PASSWORD for staging acceptance.');
 test.beforeEach(async({page})=>login(page));
 test('permission-aware navigation, URL filters and browser history',async({page})=>{await page.goto('/#admin/orders');await expect(page.getByRole('heading',{name:/orders/i})).toBeVisible();const status=page.locator('select').filter({has:page.locator('option',{hasText:'All statuses'})});await status.selectOption('COMPLETED');await expect(page).toHaveURL(/status=COMPLETED/);await page.goBack();await expect(status).toHaveValue('');});
 test('offline and reconnecting states are announced',async({page,context})=>{await page.goto('/#admin/dashboard');await context.setOffline(true);await expect(page.getByRole('status')).toContainText(/offline|离线|luar talian/i);await context.setOffline(false);await expect(page.getByRole('status')).toContainText(/reconnect|重新连接|menyambung/i);});
 test('system settings warn before discarding unsaved changes',async({page})=>{await page.goto('/#admin/system-administration');const firstText=page.locator('fieldset input[type="text"]').first();await firstText.fill(`${await firstText.inputValue()} test`);page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:/orders/i}).click();await expect(page).toHaveURL(/system-administration/);});
 test('admin layout remains usable at tablet and phone widths',async({page})=>{await page.setViewportSize({width:768,height:1024});await page.goto('/#admin/payments');await expect(page.getByRole('button',{name:/admin menu|管理菜单|menu pentadbir/i})).toBeVisible();await page.setViewportSize({width:390,height:844});await expect(page.locator('main')).toBeVisible();});
});
