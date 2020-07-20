import React, { Component } from 'react';
import ReactSelect from 'react-select';
import { assocPath, path, head, concat, propEq, prop, propOr, pathOr, findIndex, indexOf, values, keys } from 'ramda';
import { Field } from 'react-final-form';
import qs from 'qs';
import { withTranslation } from 'react-i18next';
import TreeSelect from 'rc-tree-select';

import DownOutlined from '@ant-design/icons/DownOutlined';
import CheckOutlined from '@ant-design/icons/CheckOutlined';
import CloseOutlined from '@ant-design/icons/CloseOutlined';
import CloseCircleFilled from '@ant-design/icons/CloseCircleFilled';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import LoadingOutlined from '@ant-design/icons/LoadingOutlined';

import '../../styles/select.css';
import '../../styles/tree.css';
import '../../styles/tree-select.css';

import { CompanyDictionaryContext } from '../../context/CompanyDictionary';
import withFieldWrapper from '../hocs/withFieldWrapper';

class TreeSelectComponent extends Component {
    constructor(props) {
        super(props);

        const parentDicts = values(props.settings.parents);
        const dicts = [
            ...(parentDicts || []),
            props.settings.dictionary,
        ];

        this.state = {
            dicts,
            options: {},
            loaded: {},
            treeData: [],
            loading: false,
        };
    }

    getDictionary = async (dictionary, parentId, search) => {
        const { apiUrl } = this.props;
        const urlParams = qs.stringify({
            filter: {
                dictionary,
                parent: Array.isArray(parentId) ? undefined : parentId,
                parents: Array.isArray(parentId) ? parentId : undefined
            },
            pagination: JSON.stringify({ limit: 0 }),
            relations: ['parent'],
        }, { addQueryPrefix: true });

        const response = await fetch(`${apiUrl || ''}/api/company-dictionary-item${urlParams}`);
        const items = propOr([], 'items', await response.json());

        return items;
    }

    setDictionaryItems = (items, dict, parent, parentDict, childrenPath) => {
        const insertIndex = parent ? findIndex(propEq('value', `${parentDict}_${parent}`), this.state.treeData) : 0;
        const options = items.map((item, index) => ({
            value: `${item.dictionary}_${item.id}`,
            pId: item.parent ? `${parentDict}_${item.parent}` : 0,
            label: item.value,
            data: {
                ...item,
                childrenPath: parent ? [...childrenPath, index, 'children'] : [index, 'children'],
            },
            selectable: item.dictionary === this.props.settings.dictionary,
            isLeaf: item.dictionary === this.props.settings.dictionary,
        }));

        this.setState({
            options: {
                ...this.state.options,
                [dict]: concat(this.state.options[dict] || [], items),
            },
            treeData: childrenPath ? assocPath(childrenPath, options, this.state.treeData) : options,
            loading: false,
        });
    }

    async componentDidMount() {
        const { settings } = this.props;

        const parentKeys = keys(settings.parents);
        const parentDicts = values(settings.parents);

        const dicts = [
            ...(parentDicts || []),
            settings.dictionary,
        ];
        const dict = head(dicts);

        this.setState({ loading: true, dicts });

        if (settings.multiple) {
            const items = await this.getDictionary(dict);
            this.setDictionaryItems(items, dict);
        } else {
            const dictItems = await Promise.all(dicts.map(name => this.getDictionary(name)));

            const parentHash = {};
            const parentIndex = {};
            const parentValues = {};
            let treeData = [];
            let parentDict = null;

            dictItems.forEach((dictionary, index) => {
                dictionary.forEach((item, itemIndex) => {
                    const childrenIndex = parentIndex[`${parentDict}_${item.parent}`] || 0;
                    if (!item.parent) {
                        treeData.push({
                            value: `${item.dictionary}_${item.id}`,
                            pId: 0,
                            label: item.value,
                            data: item,
                            children: [],
                            selectable: item.dictionary === this.props.settings.dictionary,
                            isLeaf: item.dictionary === this.props.settings.dictionary,
                        });
                    } else {
                        treeData = assocPath(concat(parentHash[`${parentDict}_${item.parent}`], [childrenIndex]), {
                            value: `${item.dictionary}_${item.id}`,
                            pId: item.parent ? `${parentDict}_${item.parent}` : 0,
                            label: item.value,
                            data: {
                                ...item,
                                values: parentValues[`${parentDict}_${item.parent}`],
                            },
                            selectable: item.dictionary === this.props.settings.dictionary,
                            isLeaf: item.dictionary === this.props.settings.dictionary,
                        }, treeData);
                    }
                    if (item.dictionary !== this.props.settings.dictionary) {
                        parentHash[`${item.dictionary}_${item.id}`] = concat(parentHash[`${parentDict}_${item.parent}`] || [], [childrenIndex, 'children']);
                    }
                    parentValues[`${item.dictionary}_${item.id}`] = concat(parentValues[`${parentDict}_${item.parent}`] || [], [{
                        name: parentKeys[index],
                        value: item.id,
                    }]);
                    parentIndex[`${parentDict}_${item.parent}`] = childrenIndex + 1;
                });
                parentDict = dicts[index];
            });

            this.setState({ loading: false, treeData });
        }
    }

    onLoadData = async (item) => {
        if (item.children) {
            return true;
        }

        const dictKey = this.state.dicts[indexOf(item.data.dictionary, this.state.dicts) + 1];
        const parentKeys = concat(this.state.loaded[dictKey] || [], [item.data.id]);

        const dict = await this.getDictionary(dictKey, item.data.id);

        this.setState({
            loaded: {
                ...this.state.loaded,
                [dictKey]: parentKeys,
            },
        });

        this.setDictionaryItems(dict, dictKey, item.data.id, item.data.dictionary, item.data.childrenPath);
    }

    onChange = (value) => {
        this.props.onChange(value);
    }

    onSelect = (value, option) => {
        this.props.form.batch(() => {
            if (option.data.values) {
                option.data.values.map(item => this.props.form.change(item.name, item.value));
            }
        });
    }

    getOptions = () => {
        const { settings } = this.props;
        const dictionaryKey = settings.parent || settings.dictionary;

        return pathOr([], ['options', dictionaryKey], this.state);
    }

    getParentOptions = () => {
        const { contextOptions, parentField } = this.props;

        return prop(parentField, contextOptions);
    }

    render() {
        const { loading } = this.state;
        const { input: { value }, settings, t } = this.props;
        const multiple = path(['multiple'], settings);

        return (
            <TreeSelect
                dropdownPopupAlign={{ overflow: { adjustY: 0, adjustX: 0 }, offset: [0, 8] }}
                value={value}
                treeData={this.state.treeData}
                treeNodeFilterProp="label"
                notFoundContent={loading ? t('loading') : t('noOptionsMessage')}
                onChange={this.onChange}
                onSelect={this.onSelect}
                loadData={this.onLoadData}
                treeCheckable={multiple}
                showSearch={!multiple}

                inputIcon={() => loading ? <LoadingOutlined /> : <DownOutlined />}
                switcherIcon={({ loading, isLeaf }) => loading ? <LoadingOutlined /> : isLeaf ? null : <DownOutlined />}
                removeIcon={<CloseOutlined />}
                clearIcon={<CloseCircleFilled />}
            />
        );
    }
}

const withParentField = WrappedComponent =>
    class WithParentField extends Component {
        render() {
            const { settings } = this.props;
            const parentField = prop('parentField', settings);

            return (
                <CompanyDictionaryContext.Consumer>
                    { ({ options, changeOptions }) => {
                        const renderComponent = value => (
                            <WrappedComponent
                                parentField={parentField}
                                parentFieldValue={value}
                                contextOptions={options}
                                changeContextOptions={changeOptions}
                                {...this.props}
                            />
                        );

                        return parentField ? (
                            <Field name={parentField} subscription={{ value: true }}>
                                {({ input: { value } }) => renderComponent(value)}
                            </Field>
                        ) : renderComponent();
                    }}
                </CompanyDictionaryContext.Consumer>
            );
        }
    };

export default withFieldWrapper(withParentField(withTranslation()(TreeSelectComponent)));