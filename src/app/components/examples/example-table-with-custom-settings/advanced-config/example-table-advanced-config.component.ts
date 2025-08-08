import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AppState, formatValue } from '@core/public-api';
import { Store } from '@ngrx/store';
import { getSourceTbUnitSymbol, WidgetSettings, WidgetSettingsComponent } from '@shared/public-api';
import { valueDefaultSettings } from '../example-table-custom-settings.component';

@Component({
    selector: 'tb-example-table-advanced-config',
    templateUrl: './example-table-advanced-config.component.html',
    styleUrls: []
})

export class ExampleTableAdvancedConfigComponent extends WidgetSettingsComponent {

    public exampleTableConfigForm: FormGroup;
    public valuePreviewFn = this._valuePreviewFn.bind(this);
    constructor(protected store: Store<AppState>,
                private fb: FormBuilder) {
        super(store);
    }

    protected defaultSettings(): WidgetSettings {
        return valueDefaultSettings;
    }

    protected onSettingsSet(settings: WidgetSettings): any {
        this.exampleTableConfigForm = this.fb.group({
            columnHeight: [settings.columnHeight, [Validators.required]],
            valueColor: [settings.valueColor, []],
            keyColor: [settings.keyColor, []],
            keyFont: [settings.keyFont, []],
            valueFont: [settings.valueFont, []]
        });
    }

    private _valuePreviewFn(): string {
        const units = getSourceTbUnitSymbol(this.widgetConfig.config.units);
        const decimals: number = this.widgetConfig.config.decimals;
        return formatValue(22, decimals, units, true);
    }

    protected settingsForm(): FormGroup {
        return this.exampleTableConfigForm;
    }
}
