const React = Spicetify.React;
const { useState } = React;
const ReactDOM = Spicetify.ReactDOM;

import type {
  ISettingsField,
  ISettingsFieldButton,
  ISettingsFieldDropdown,
  ISettingsFieldGroup,
  ISettingsFieldInput,
  ISettingsFieldToggle,
} from "./types/settings-field.ts";

class SettingsSection {
  settingsFields: { [nameId: string]: ISettingsField };
  private stopHistoryListener: any;
  private setRerender: ((randomNumber: number) => void) | null = null;

  constructor(
    public name: string,
    public settingsId: string,
    public initialSettingsFields: { [key: string]: ISettingsField } = {}
  ) {
    this.settingsFields = initialSettingsFields;
  }

  pushSettings = async () => {
    Object.entries(this.settingsFields).forEach(([nameId, field]) => {
      if (field.type !== "button" && field.type !== "group" && this.getFieldValue(nameId) === undefined) {
        this.setFieldValue(nameId, field.defaultValue);
      }
    });

    while (!Spicetify?.Platform?.History?.listen) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this.stopHistoryListener) this.stopHistoryListener();

    this.stopHistoryListener = Spicetify.Platform.History.listen((e: any) => {
      if (e.pathname === "/preferences") {
        this.render();
      }
    });

    if (Spicetify.Platform.History.location.pathname === "/preferences") {
      await this.render();
    }
  };

  rerender = () => {
    if (this.setRerender) {
      this.setRerender(Math.random());
    }
  };

  private render = async () => {
    while (!document.getElementById("desktop.settings.selectLanguage")) {
      if (Spicetify.Platform.History.location.pathname !== "/preferences") return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const allSettingsContainer = document.querySelector(
      ".main-view-container__scroll-node-child main div"
    );
    if (!allSettingsContainer) return console.error("[spcr-settings] settings container not found");

    let pluginSettingsContainer = Array.from(allSettingsContainer.children).find(
      (child) => child.id === this.settingsId
    );

    if (!pluginSettingsContainer) {
      pluginSettingsContainer = document.createElement("div");
      pluginSettingsContainer.id = this.settingsId;

      allSettingsContainer.appendChild(pluginSettingsContainer);
    }

    ReactDOM.render(<this.FieldsContainer />, pluginSettingsContainer);
  };

  addButton = (
    nameId: string,
    description: string,
    value: string,
    onClick?: () => void,
    events?: ISettingsFieldButton["events"]
  ) => {
    this.settingsFields[nameId] = {
      type: "button",
      description: description,
      value: value,
      events: {
        onClick: onClick,
        ...events,
      },
    };
  };

  addInput = (
    nameId: string,
    description: string,
    defaultValue: string,
    onChange?: () => void,
    inputType?: string,
    events?: ISettingsFieldInput["events"]
  ) => {
    this.settingsFields[nameId] = {
      type: "input",
      description: description,
      defaultValue: defaultValue,
      inputType: inputType,
      events: {
        onChange: onChange,
        ...events,
      },
    };
  };

  addHidden = (nameId: string, defaultValue: any) => {
    this.settingsFields[nameId] = {
      type: "hidden",
      defaultValue: defaultValue,
    };
  };

  addToggle = (
    nameId: string,
    description: string,
    defaultValue: boolean,
    onChange?: () => void,
    events?: ISettingsFieldToggle["events"]
  ) => {
    this.settingsFields[nameId] = {
      type: "toggle",
      description: description,
      defaultValue: defaultValue,
      events: {
        onChange: onChange,
        ...events,
      },
    };
  };

  addDropDown = (
    nameId: string,
    description: string,
    options: string[],
    defaultIndex: number,
    onSelect?: () => void,
    events?: ISettingsFieldDropdown["events"]
  ) => {
    this.settingsFields[nameId] = {
      type: "dropdown",
      description: description,
      defaultValue: options[defaultIndex],
      options: options,
      events: {
        onSelect: onSelect,
        ...events,
      },
    };
  };

  addGroup = (name: string) => {
    const groupId = `__group_${Object.keys(this.settingsFields).length}`;
    this.settingsFields[groupId] = {
      type: "group",
      description: name,
    };
  };

  getFieldValue = <Type,>(nameId: string): Type => {
    return JSON.parse(Spicetify.LocalStorage.get(`${this.settingsId}.${nameId}`) || "{}")?.value;
  };

  setFieldValue = (nameId: string, newValue: any) => {
    Spicetify.LocalStorage.set(`${this.settingsId}.${nameId}`, JSON.stringify({ value: newValue }));
  };

  private FieldsContainer = () => {
    // @ts-expect-error
    const [rerender, setRerender] = useState<number>(0);
    this.setRerender = setRerender;

    return (
      <div className="x-settings-section YtAW7cQal8op8H9JkJ8T" key={rerender}>
        <h2 className="TypeElement-cello-textBase-type e-91000-text encore-text-body-medium-bold encore-internal-color-text-base e-91000-text encore-text-body-medium-bold encore-internal-color-text-base">
          {this.name}
        </h2>
        {Object.entries(this.settingsFields).map(([nameId, field]) => {
          return <this.Field nameId={nameId} field={field} />;
        })}
      </div>
    );
  };

  private Field = (props: { nameId: string; field: ISettingsField }) => {
    const id = `${this.settingsId}.${props.nameId}`;

    let defaultStateValue: any;
    if (props.field.type === "button") {
      defaultStateValue = props.field.value;
    } else {
      defaultStateValue = this.getFieldValue(props.nameId);
    }

    if (props.field.type === "hidden") {
      return null;
    }

    if (props.field.type === "group") {
      return (
        <h3 className="spicy-settings-group-header">
          {props.field.description}
        </h3>
      );
    }

    const [value, setValueState] = useState(defaultStateValue);

    const setValue = (newValue?: any) => {
      if (newValue !== undefined) {
        setValueState(newValue);
        this.setFieldValue(props.nameId, newValue);
      }
    };

    return (
      <div className="x-settings-row eguwzH_QWTBXry7hiNj3">
        <div className="x-settings-firstColumn lfXDZUXLhhKhFPjDO8by">
          <label className="TypeElement-viola-textSubdued-type e-91000-text encore-text-body-small encore-internal-color-text-subdued" htmlFor={id}>
            {props.field.description || ""}
          </label>
        </div>
        <div className="x-settings-secondColumn jKCZodyn7H2Trr7dhvGm">
          {props.field.type === "input" ? (
            <input
              className="x-settings-input"
              id={id}
              dir="ltr"
              value={value as string}
              type={props.field.inputType || "text"}
              {...props.field.events}
              onChange={(e) => {
                setValue(e.currentTarget.value);
                const onChange = (props.field as ISettingsFieldInput).events?.onChange;
                if (onChange) onChange(e);
              }}
            />
          ) : props.field.type === "button" ? (
            <span>
              <button
                id={id}
                className="Button-sc-y0gtbx-0 Button-small-buttonSecondary-useBrowserDefaultFocusStyle Button-sc-y0gtbx-0 Button-buttonSecondary-small-useBrowserDefaultFocusStyle encore-text-body-small-bold e-91000-button--small l_pugTMA53sS_K65iEiW Button-buttonSecondary-small-isUsingKeyboard-useBrowserDefaultFocusStyle x-settings-button"
                {...props.field.events}
                onClick={(e) => {
                  setValue();
                  const onClick = (props.field as ISettingsFieldButton).events?.onClick;
                  if (onClick) onClick(e);
                }}
                type="button"
              >
                {value}
              </button>
            </span>
          ) : props.field.type === "toggle" ? (
            <label className="x-settings-secondColumn x-toggle-wrapper ztL0S6Lyoye5upzDS_yU">
              <input
                id={id}
                className="x-toggle-input Smo4wLHtFoFOOsJP0evo"
                type="checkbox"
                checked={value as boolean}
                {...props.field.events}
                onClick={(e) => {
                  setValue(e.currentTarget.checked);
                  const onClick = (props.field as ISettingsFieldToggle).events?.onClick;
                  if (onClick) onClick(e);
                }}
              />
              <span className="x-toggle-indicatorWrapper Qb0gCQFXpstteRqnAF9q">
                <span className="x-toggle-indicator sxTbfT6ioOgvOvHzaBE7"></span>
              </span>
            </label>
          ) : props.field.type === "dropdown" ? (
            <select
              className="main-dropDown-dropDown FQupgLGfMkp1dOYvUeuQ"
              id={id}
              {...props.field.events}
              onChange={(e) => {
                setValue(
                  (props.field as ISettingsFieldDropdown).options[e.currentTarget.selectedIndex]
                );
                const onSelect = (props.field as ISettingsFieldDropdown).events?.onSelect;
                if (onSelect) onSelect(e);
              }}
            >
              {props.field.options.map((option, i) => {
                return (
                  <option selected={option === value} value={i + 1}>
                    {option}
                  </option>
                );
              })}
            </select>
          ) : null}
        </div>
      </div>
    );
  };
}

export { SettingsSection };
