import { Component } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Store } from '@ngrx/store';
import { ColorSettings, WidgetSettings, WidgetSettingsComponent, constantColor } from '@shared/public-api';
import { AppState } from '@core/core.state';

interface KeySettings {
    showIcon: boolean,
    iconSize: number,
    iconSizeUnit: string,
    icon: string,
    iconColor: ColorSettings
}

@Component({
    selector: 'tb-example-table-key-settings',
    templateUrl: './data-key-settings.component.html',
    styleUrls: []
})

export class DataKeySettingsComponent extends WidgetSettingsComponent {

    private defaultSettingsValue: KeySettings = {
        showIcon: false,
        iconSize: 30,
        iconSizeUnit: 'px',
        icon: 'thermostat',
        iconColor: constantColor('#5469FF')
    }
    
    public keySettingsForm: FormGroup;
    
    constructor(protected store: Store<AppState>,
                private fb: FormBuilder) {
        super(store)
    }
    protected settingsForm(): FormGroup {
        return this.keySettingsForm;
    }

    protected defaultSettings(): WidgetSettings {
        return this.defaultSettingsValue;
    }

    protected onSettingsSet(settings: WidgetSettings) {
        this.keySettingsForm = this.fb.group({
            showIcon: [settings.showIcon,[]],
            icon: [settings.icon, []],
            iconSize: [settings.iconSize, []],
            iconSizeUnit: [settings.iconSizeUnit, []],
            iconColor: [settings.iconColor, []]
        })
    }

}
