const fs = require('fs');
const path = require('path');

module.exports = function(context) {
    console.log('--- Executing hook to copy Android splash screen icon ---');

    const platformRoot = path.join(context.opts.projectRoot, 'platforms/android');
    const projectRoot = context.opts.projectRoot;

    // Путь к вашей иконке в проекте
    const sourceFile = path.join(projectRoot, 'resources/android/splash/splash_icon.xml');

    // Куда нужно скопировать иконку
    const destDir = path.join(platformRoot, 'app/src/main/res/drawable');
    const destFile = path.join(destDir, 'splash_icon.xml');

    // Проверяем, существует ли исходный файл
    if (fs.existsSync(sourceFile)) {
        // Создаем папку назначения, если ее нет
        fs.mkdirSync(destDir, { recursive: true });
        // Копируем файл
        fs.copyFileSync(sourceFile, destFile);
        console.log(`Successfully copied ${sourceFile} to ${destFile}`);
    } else {
        console.error(`ERROR: Splash screen icon source file not found at ${sourceFile}`);
    }
};