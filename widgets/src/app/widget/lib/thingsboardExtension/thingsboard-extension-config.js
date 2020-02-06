/*
 * Copyright © 2020 ThingsBoard
 */
import getThingsboardExtensionLocaleEnglish from './locale/thingsboard-extension-locale.constant';

/*@ngInject*/

export default function ThingsboardExtensionConfig($translateProvider) {
    var engLocale = getThingsboardExtensionLocaleEnglish();
    $translateProvider.translations("en_US", engLocale);
}
