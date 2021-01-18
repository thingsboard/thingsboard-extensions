///
/// Copyright © 2021 ThingsBoard, Inc.
///

import { TranslateService } from '@ngx-translate/core';

export default function addCustomWidgetLocale(translate: TranslateService) {

  const enUS = {
    tb: {
      translate: "translate"
    }
  };
  translate.setTranslation('en_US', enUS, true);
}
